"""Send short-lived threshold commands; only device telemetry confirms application."""
import copy
import json
import math
import time
import uuid
from decimal import Decimal

import paho.mqtt.client as mqtt
from fastapi import HTTPException
from pydantic import BaseModel, ConfigDict, Field, StrictInt, field_validator, model_validator
from app.services.command_journal import JournalController

COMMAND_TIMEOUT_SECONDS = 20


class Thresholds(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)
    mq2_on: StrictInt = Field(ge=1, le=1023)
    mq2_off: StrictInt = Field(ge=0, le=1022)
    temperature_on_c: float = Field(ge=-55, le=125)
    temperature_off_c: float = Field(ge=-55, le=125)

    @field_validator("temperature_on_c", "temperature_off_c", mode="before")
    @classmethod
    def temperature_precision(cls, value):
        if type(value) not in (int, float) or not math.isfinite(value):
            raise ValueError("Nhiệt độ phải là số hữu hạn")
        if Decimal(str(value)) * 10 != (Decimal(str(value)) * 10).to_integral_value():
            raise ValueError("Ngưỡng nhiệt độ dùng tối đa một chữ số thập phân")
        return value

    @model_validator(mode="after")
    def hysteresis(self):
        if self.mq2_off >= self.mq2_on or self.temperature_off_c >= self.temperature_on_c:
            raise ValueError("Ngưỡng tắt phải nhỏ hơn ngưỡng bật")
        return self


class ThresholdUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    expected_boot_id: str = Field(pattern=r"^[0-9a-f]{16}$")
    expected_revision: StrictInt = Field(ge=0, le=2**32 - 1)
    thresholds: Thresholds


def current_thresholds(data):
    return {"mq2_on": data["mq2"]["adc_on"], "mq2_off": data["mq2"]["adc_off"],
            "temperature_on_c": data["limits"]["temperature_on_c"],
            "temperature_off_c": data["limits"]["temperature_off_c"]}


def supported(data):
    remote = data.get("remote_config")
    return (data.get("schema_version") == 6 and type(remote) is dict
            and type(remote.get("version")) is int and remote["version"] == 1)


class RemoteController(JournalController):
    command_type = "thresholds"
    supported = staticmethod(supported)

    @staticmethod
    def public(command):
        return copy.deepcopy({key: command[key] for key in
                              ("request_id", "status", "thresholds", "message")})

    def _refresh(self, item, now):
        data = item["data"]
        command = self.commands.get(data["device_id"])
        if not command or command["status"] == "applied":
            return command
        remote = data.get("remote_config") or {}
        # A matching durable record may confirm even after a reboot or a delayed packet.
        if (supported(data) and remote.get("last_request_id") == command["request_id"]
                and remote.get("revision") == command["expected_revision"] + 1
                and current_thresholds(data) == command["thresholds"]):
            command.update(status="applied", message="ESP đã áp dụng và lưu ngưỡng mới.")
        elif command["status"] in ("pending", "unconfirmed"):
            if (data["boot_id"] != command["boot_id"] or not supported(data)
                    or remote.get("revision") != command["expected_revision"]):
                command.update(status="superseded",
                               message="ESP đã khởi động lại hoặc cấu hình đã đổi; hãy kiểm tra ngưỡng đang dùng.")
            elif now >= command["deadline"]:
                command.update(status="timeout",
                               message="Chưa nhận được xác nhận từ ESP. Hãy kiểm tra kết nối và ngưỡng đang dùng.")
        return command

    def submit(self, item, body, connected, user):
        with self.lock:
            now = time.monotonic()
            data = item["data"]
            if not item["online"]:
                raise HTTPException(409, "ESP đang offline; chưa thể đổi ngưỡng.")
            if not supported(data):
                raise HTTPException(409, "Cần nạp firmware hỗ trợ chỉnh ngưỡng từ xa.")
            if not connected or not self.client.is_connected():
                raise HTTPException(503, "MQTT chưa kết nối; chưa gửi lệnh đến ESP.")
            remote = data["remote_config"]
            if (body.expected_boot_id != data["boot_id"]
                    or body.expected_revision != remote["revision"]):
                raise HTTPException(409, "Dữ liệu cấu hình đã thay đổi; tải lại ngưỡng đang dùng rồi thử lại.")
            self.latest[data["device_id"]] = copy.deepcopy(item)
            existing = self.reconcile(item, now)
            if existing and existing["status"] in ("pending", "unconfirmed"):
                raise HTTPException(409, "Đang chờ ESP xác nhận lệnh trước.")
            thresholds = body.thresholds.model_dump()
            command = {"request_id": uuid.uuid4().hex, "status": "pending",
                       "thresholds": thresholds, "boot_id": data["boot_id"],
                       "expected_revision": remote["revision"],
                       "deadline": now + COMMAND_TIMEOUT_SECONDS,
                       "message": "Đã gửi yêu cầu; đang chờ ESP xác nhận ngưỡng đã lưu."}
            if thresholds == current_thresholds(data):
                command.update(status="applied", message="ESP đang dùng các ngưỡng này; không cần gửi lại.")
                self.record(command, item, self.command_type, None, user, COMMAND_TIMEOUT_SECONDS)
                self.commands[data["device_id"]] = command
                return self.public(command)
            if remote["revision"] == 2**32 - 1:
                raise HTTPException(409, "Bộ đếm cấu hình đã đầy; cần bảo trì firmware.")
            wire = {"request_id": command["request_id"], "boot_id": data["boot_id"],
                    "expected_revision": remote["revision"],
                    "expires_uptime_s": int(data["uptime_s"] + max(0, item["age_seconds"])
                                            + COMMAND_TIMEOUT_SECONDS),
                    "thresholds": thresholds}
            self.record(command, item, self.command_type, wire, user, COMMAND_TIMEOUT_SECONDS)
            def publish():
                info = self.client.publish("iot/devices/" + data["device_id"] + "/config/set",
                                           json.dumps(wire, separators=(",", ":"), allow_nan=False),
                                           qos=1, retain=False)
                if info.rc != mqtt.MQTT_ERR_SUCCESS:
                    raise RuntimeError("publish failed")
            self.commands[data["device_id"]] = command
            self.dispatch(command, user, publish)
            return self.public(command)
