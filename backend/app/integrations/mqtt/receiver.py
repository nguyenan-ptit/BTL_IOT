import logging
import re
import threading

import paho.mqtt.client as mqtt

from app.db.device_storage import DeviceNotAllowed, DeviceNotRegistered, StorageError, save
from app.services.telemetry_validation import validate_message

logger = logging.getLogger("iot_full")
TELEMETRY_TOPIC = re.compile(r"iot/devices/([A-Za-z0-9_-]{1,32})/telemetry\Z")


class Receiver:
    def __init__(self, config, on_accepted=None):
        self.config = config
        self.on_accepted = on_accepted
        self.lock = threading.Lock()
        self.status = {"connected": False, "accepted": 0, "rejected": 0, "duplicates": 0, "last_error": None}
        self.client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2,
                                  client_id=config.get("mqtt_client_id", "iot-full-backend"))
        self.client.on_connect = self.on_connect
        self.client.on_disconnect = self.on_disconnect
        self.client.on_message = self.on_message
        self.client.on_subscribe = self.on_subscribe
        self.client.reconnect_delay_set(min_delay=1, max_delay=30)
        if config.get("mqtt_username"):
            self.client.username_pw_set(config["mqtt_username"], config.get("mqtt_password", ""))
        if config.get("mqtt_tls"):
            self.client.tls_set(ca_certs=str(config["mqtt_ca_certs"]))
            self.client.tls_insecure_set(False)

    def snapshot(self):
        with self.lock:
            return dict(self.status)

    def update(self, **changes):
        with self.lock:
            self.status.update(changes)

    def on_connect(self, client, userdata, flags, reason_code, properties):
        if reason_code == 0:
            self.update(connected=False, last_error=None)
            client.subscribe(self.config["mqtt_topic"], qos=0)
        else:
            self.update(connected=False, last_error="MQTT từ chối kết nối; kiểm tra tài khoản/cấu hình")

    def on_subscribe(self, client, userdata, mid, reason_codes, properties):
        success = bool(reason_codes) and all(not code.is_failure for code in reason_codes)
        self.update(connected=success, last_error=None if success else "MQTT không cho phép nhận topic")

    def on_disconnect(self, client, userdata, disconnect_flags, reason_code, properties):
        self.update(connected=False, last_error="Mất kết nối MQTT; đang thử kết nối lại")

    def on_message(self, client, userdata, message):
        try:
            topic = TELEMETRY_TOPIC.fullmatch(message.topic) if isinstance(message.topic, str) else None
            if topic is None or message.retain:
                raise ValueError("Topic telemetry không hợp lệ hoặc bản tin retained")
            data = validate_message(message.payload)
            if data["device_id"] != topic.group(1):
                raise ValueError("Mã thiết bị trong telemetry không khớp topic")
            inserted = save(data)
        except (ValueError, UnicodeDecodeError, TypeError, OverflowError, RecursionError):
            with self.lock:
                self.status["rejected"] += 1
            return
        except DeviceNotRegistered:
            with self.lock:
                self.status["rejected"] += 1
                self.status["last_error"] = "Thiết bị chưa đăng ký trong bảng devices"
            return
        except DeviceNotAllowed:
            with self.lock:
                self.status["rejected"] += 1
                self.status["last_error"] = "Thiết bị cần lifecycle_status và credential_status đều active"
            return
        except StorageError:
            self.update(last_error="Không ghi được MySQL; kiểm tra kết nối, tài khoản và quyền ghi")
            return
        except Exception as exc:
            with self.lock:
                self.status["rejected"] += 1
                self.status["last_error"] = "Lỗi xử lý telemetry: " + type(exc).__name__
            logger.error("Unexpected telemetry error: %s", type(exc).__name__)
            return
        with self.lock:
            if inserted:
                self.status["accepted"] += 1
            else:
                self.status["duplicates"] += 1
            self.status["last_error"] = None
        if inserted and not data.get("backfill", False) and self.on_accepted:
            try:
                self.on_accepted(data)
            except Exception as exc:
                self.update(last_error="Đã lưu telemetry; chưa cập nhật được lịch sử lệnh")
                logger.error("Command reconciliation error: %s", type(exc).__name__)

    def start(self):
        self.client.connect_async(self.config["mqtt_host"], self.config["mqtt_port"], keepalive=30)
        self.client.loop_start()

    def stop(self):
        self.client.disconnect()
        self.client.loop_stop()

