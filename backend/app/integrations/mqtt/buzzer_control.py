"""Acknowledged buzzer and red LED tests; stopping never mutes real alarms."""
import copy
import json
import time
import uuid
from typing import Literal

import paho.mqtt.client as mqtt
from fastapi import HTTPException
from pydantic import BaseModel, ConfigDict, Field, StrictInt

from app.integrations.mqtt.remote_control import COMMAND_TIMEOUT_SECONDS
from app.services.command_journal import JournalController


class BuzzerTestUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    expected_boot_id: str = Field(min_length=16, max_length=16, pattern=r"^[0-9a-f]{16}$")
    expected_seq: StrictInt = Field(ge=0, le=2**32 - 1)
    action: Literal["start", "stop"]


def supported(data):
    test = data.get("buzzer_test")
    return (data.get("schema_version") == 6 and type(test) is dict
            and type(test.get("version")) is int and test["version"] == 2)


class BuzzerController(JournalController):
    command_type = "buzzer_test"
    supported = staticmethod(supported)

    @staticmethod
    def public(command):
        return copy.deepcopy({key: command[key] for key in
                              ("request_id", "action", "status", "message")})

    def _refresh(self, item, now):
        data = item["data"]
        command = self.commands.get(data["device_id"])
        if not command or command.get("noop") or command["status"] in ("completed", "stopped", "blocked", "interrupted"):
            return command
        test = data.get("buzzer_test") or {}
        matching = (supported(data) and data["boot_id"] == command["boot_id"]
                    and test.get("last_request_id") == command["request_id"]
                    and test.get("command_seq") == command["expected_seq"] + 1)
        if matching:
            state = test["status"]
            expected_states = ({"running", "completed", "blocked", "interrupted"}
                               if command["action"] == "start" else {"stopped"})
            if state not in expected_states:
                command.update(status="superseded", message="Xác nhận ESP không khớp lệnh vừa gửi; kiểm tra lại trạng thái.")
                return command
            messages = {
                "running": "ESP đang thực hiện lượt thử còi và đèn 3 giây; hãy kiểm tra âm thanh và đèn thực tế.",
                "completed": "ESP đã kết thúc lượt thử còi và đèn.",
                "stopped": "ESP đã dừng lượt thử còi và đèn. Cảnh báo thật vẫn được ưu tiên.",
                "blocked": "ESP đang có cảnh báo thật nên không bắt đầu lượt thử còi và đèn.",
                "interrupted": "Lượt thử còi và đèn đã nhường cho cảnh báo thật của ESP.",
            }
            if state == "running" and now >= command["deadline"]:
                command.update(status="timeout", message="Mất dữ liệu từ ESP; chưa xác nhận được kết thúc lượt thử còi và đèn.")
            elif state in messages:
                command.update(status=state, message=messages[state])
        elif command["status"] in ("pending", "running", "unconfirmed"):
            if (not supported(data) or data["boot_id"] != command["boot_id"]
                    or test.get("command_seq") != command["expected_seq"]):
                command.update(status="superseded", message="ESP hoặc lệnh điều khiển đã thay đổi; kiểm tra lại trạng thái.")
            elif now >= command["deadline"]:
                command.update(status="timeout", message="Chưa nhận được xác nhận từ ESP; không tự gửi lại lệnh thử còi và đèn.")
        return command

    def submit(self, item, body, connected, user):
        with self.lock:
            now, data = time.monotonic(), item["data"]
            if not item["online"]:
                raise HTTPException(409, "ESP đang offline; chưa thể thử còi và đèn.")
            if not supported(data):
                raise HTTPException(409, "Cần nạp firmware hỗ trợ thử còi và đèn từ xa.")
            if not connected or not self.client.is_connected():
                raise HTTPException(503, "MQTT chưa kết nối; chưa gửi lệnh thử còi và đèn.")
            test = data["buzzer_test"]
            if body.expected_boot_id != data["boot_id"] or body.expected_seq != test["command_seq"]:
                raise HTTPException(409, "Trạng thái ESP đã đổi; chờ dữ liệu mới rồi thử lại.")
            self.latest[data["device_id"]] = copy.deepcopy(item)
            previous = self.reconcile(item, now)
            if previous and previous["status"] in ("pending", "unconfirmed"):
                raise HTTPException(409, "Đang chờ ESP xác nhận lệnh thử còi và đèn trước.")
            if body.action == "start" and data["system_state"] == "alarm":
                raise HTTPException(409, "Đang có cảnh báo thật; chưa bắt đầu thử còi và đèn.")
            if body.action == "start" and test["active"]:
                raise HTTPException(409, "ESP đang thử còi và đèn; lượt thử tự kết thúc sau 3 giây.")
            command = {"request_id": uuid.uuid4().hex, "action": body.action,
                       "status": "pending", "boot_id": data["boot_id"],
                       "expected_seq": test["command_seq"], "deadline": now + COMMAND_TIMEOUT_SECONDS,
                       "message": "Đã gửi yêu cầu thử còi và đèn; đang chờ ESP xác nhận."}
            if body.action == "stop" and not test["active"]:
                command.update(status="stopped", noop=True,
                               message="Không có lượt thử còi và đèn đang chạy. Lệnh này không tắt cảnh báo thật.")
                self.record(command, item, self.command_type, None, user, COMMAND_TIMEOUT_SECONDS)
                self.commands[data["device_id"]] = command
                return self.public(command)
            if test["command_seq"] == 2**32 - 1:
                raise HTTPException(409, "Bộ đếm lệnh đã đầy; cần khởi động lại ESP.")
            wire = {"request_id": command["request_id"], "boot_id": data["boot_id"],
                    "expected_seq": test["command_seq"],
                    "expires_uptime_s": int(data["uptime_s"] + max(0, item["age_seconds"])
                                            + COMMAND_TIMEOUT_SECONDS),
                    "action": body.action}
            self.record(command, item, self.command_type, wire, user, COMMAND_TIMEOUT_SECONDS)
            def publish():
                result = self.client.publish("iot/devices/" + data["device_id"] + "/buzzer/test",
                                             json.dumps(wire, separators=(",", ":"), allow_nan=False),
                                             qos=1, retain=False)
                if result.rc != mqtt.MQTT_ERR_SUCCESS:
                    raise RuntimeError("publish failed")
            self.commands[data["device_id"]] = command
            self.dispatch(command, user, publish)
            return self.public(command)
