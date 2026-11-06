import logging
import re
import threading
import os
from datetime import datetime
from contextlib import asynccontextmanager
import json
import pymysql
from pathlib import Path
from urllib.parse import urlsplit

import paho.mqtt.client as mqtt
from fastapi import FastAPI, HTTPException, Query, Request, Depends, Path as ApiPath
from fastapi.exceptions import RequestValidationError
from fastapi.responses import FileResponse, JSONResponse

from settings import load_settings
from storage import (StorageError, DeviceNotRegistered, DeviceNotAllowed, configure as configure_storage,
                     initialize, save, read_latest, history)
from validation import validate_message
from remote_control import RemoteController, ThresholdUpdate
from buzzer_control import BuzzerController, BuzzerTestUpdate
from discovery import DiscoveryResponder
from auth import get_current_user, require_roles
from emqx_admin import EmqxAdmin
from storage import allowed_device, session, recover_commands, expire_commands, backend_guard

logger = logging.getLogger("iot_full")
HERE = Path(__file__).resolve().parent
TELEMETRY_TOPIC = re.compile(r"iot/devices/([A-Za-z0-9_-]{1,32})/telemetry\Z")


class Receiver:
    def __init__(self, config, on_accepted=None):
        self.config = config
        self.on_accepted = on_accepted
        self.lock = threading.Lock()
        self.status = {"connected": False, "accepted": 0, "rejected": 0, "duplicates": 0, "last_error": None}
        self.client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2, client_id=config.get("mqtt_client_id", "iot-full-backend"))
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
        # connected means the subscription succeeded, not just the TCP connection.
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
            return  # Never log a raw untrusted payload or credentials.
        except DeviceNotRegistered:
            # Node chưa có trong bảng devices (khóa ngoại 1452): từ chối bản tin, vẫn nhận các node khác.
            with self.lock:
                self.status["rejected"] += 1
                self.status["last_error"] = "Thiết bị chưa đăng ký trong bảng devices"
            return
        except DeviceNotAllowed:
            # Node có trong bảng devices nhưng đang bị khóa / đã ngừng sử dụng / credential bị thu hồi.
            with self.lock:
                self.status["rejected"] += 1
                self.status["last_error"] = "Thiết bị cần lifecycle_status và credential_status đều active"
            return
        except StorageError:
            # storage.py đã log loại lỗi/mã lỗi; không log payload hay thông tin đăng nhập.
            self.update(last_error="Không ghi được MySQL; kiểm tra kết nối, tài khoản và quyền ghi")
            return
        except Exception as exc:
            # Một bản tin lỗi bất ngờ không được làm chết luồng nhận MQTT của paho.
            with self.lock:
                self.status["rejected"] += 1
                self.status["last_error"] = "Lỗi xử lý telemetry: " + type(exc).__name__
            logger.error("Unexpected telemetry error: %s", type(exc).__name__)
            return
        with self.lock:
            if inserted:
                self.status["accepted"] += 1
            else:
                self.status["duplicates"] += 1  # trùng (device_id, boot_id, seq): bỏ qua, không làm mới
            self.status["last_error"] = None
        if inserted and self.on_accepted:
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


@asynccontextmanager
async def lifespan(app):
    config = load_settings()
    if len(os.environ.get("JWT_SECRET", "")) < 32:
        raise ValueError("Cần JWT_SECRET ít nhất 32 ký tự từ dịch vụ tài khoản")
    configure_storage(config["mysql"])
    with backend_guard() as guard:
        initialize()
        recover_commands()
        app.state.config = config
        app.state.receiver = Receiver(config)
        app.state.remote_control = RemoteController(app.state.receiver.client)
        app.state.buzzer_control = BuzzerController(app.state.receiver.client)
        app.state.emqx_admin = EmqxAdmin({**config["emqx_admin"],
                                        "protected_usernames": [config.get("mqtt_username")]})
        app.state.command_worker_ready = True
        controllers = (app.state.remote_control, app.state.buzzer_control)

        def observe(data):
            for controller in controllers:
                try:
                    controller.observe(data)
                except StorageError:
                    logger.error("Cannot persist command acknowledgement; will retry")
        app.state.receiver.on_accepted = observe
        stop_worker = threading.Event()

        def reconcile_timeouts():
            while not stop_worker.wait(1):
                try:
                    guard.execute("SELECT 1")
                except Exception:
                    app.state.command_worker_ready = False
                    logger.error("Backend database lease lost; stopping MQTT ingestion and control")
                    app.state.receiver.stop()
                    return
                for controller in controllers:
                    try:
                        controller.tick()
                    except Exception as exc:
                        logger.error("Command worker error: %s", type(exc).__name__)
                try:
                    expire_commands()
                except StorageError:
                    logger.error("Cannot expire untracked commands; will retry")

        worker = threading.Thread(target=reconcile_timeouts, name="command-journal", daemon=True)
        app.state.discovery = DiscoveryResponder(config, lambda: app.state.receiver.snapshot()["connected"])
        try:
            app.state.receiver.start()
            app.state.discovery.start()
            worker.start()
            yield
        finally:
            stop_worker.set()
            app.state.discovery.stop()
            app.state.receiver.stop()
            if worker.ident is not None:
                worker.join(timeout=35)
            app.state.command_worker_ready = False


app = FastAPI(title="Theo dõi cảm biến phòng trọ — bản thử", lifespan=lifespan)


@app.exception_handler(StorageError)
async def storage_failure(request, exc):
    if exc.errno == 1062:
        return JSONResponse(status_code=409, content={"detail": "Dữ liệu định danh đã tồn tại."})
    return JSONResponse(status_code=503, content={"detail": "Không truy cập được cơ sở dữ liệu; hãy thử lại."})


@app.exception_handler(RequestValidationError)
async def invalid_request(request, exc):
    # Pydantic errors can contain NaN/Inf or raw input; neither belongs in JSON responses.
    return JSONResponse(status_code=422, content={"detail": [
        {key: error[key] for key in ("loc", "msg", "type")} for error in exc.errors()
    ]})


@app.get("/", include_in_schema=False)
def dashboard():
    return FileResponse(HERE / "index.html", headers={"Cache-Control": "no-store"})


@app.get("/api/health")
def health():
    return {"mqtt": app.state.receiver.snapshot(), "discovery": app.state.discovery.snapshot(), "prototype": True}


@app.get("/api/devices")
def devices(user: dict = Depends(get_current_user)):
    try:
        items = read_latest(user)
    except StorageError:
        raise HTTPException(503, "Chưa đọc được dữ liệu cảm biến") from None
    for item in items:
        item["can_control"] = (user["role"] in ("admin", "owner") and item["lifecycle_status"] == "active"
                               and item["credential_status"] == "active"
                               and item["device"]["mqtt_sync_status"] not in ("pending", "failed"))
        item["remote_control"] = app.state.remote_control.snapshot(item)
        item["buzzer_control"] = app.state.buzzer_control.snapshot(item)
    return {"items": items, "mqtt": app.state.receiver.snapshot(), "prototype": True}


@app.get("/api/admin/mqtt-capabilities")
def mqtt_capabilities(user: dict = Depends(require_roles("admin"))):
    return app.state.emqx_admin.capabilities()


def control_item(device_id, user):
    if not getattr(app.state, "command_worker_ready", True):
        raise HTTPException(503, "Bộ xử lý lệnh chưa sẵn sàng; cần khởi động lại backend.")
    with session() as cursor:
        allowed_device(cursor, user, device_id, control=True)
    item = next((item for item in read_latest(user) if item["device_id"] == device_id), None)
    if item is None or item["data"] is None:
        raise HTTPException(404, "Chưa có telemetry của thiết bị trong phòng hiện tại.")
    return item


def check_control_request(request):
    # A custom header plus same-origin checks prevents ordinary cross-site form/fetch writes.
    if request.headers.get("x-iot-request") != "1":
        raise HTTPException(403, "Chỉ nhận lệnh từ trang điều khiển của hệ thống.")
    origin = request.headers.get("origin")
    if origin:
        try:
            source, target = urlsplit(origin), urlsplit(str(request.base_url))
            def authority(url):
                return url.scheme, url.hostname, url.port or (443 if url.scheme == "https" else 80)
            allowed = (source.scheme in ("http", "https") and source.path in ("", "/")
                       and not source.query and not source.fragment and not source.username
                       and authority(source) == authority(target))
        except ValueError:
            allowed = False
        if not allowed:
            raise HTTPException(403, "Không nhận lệnh từ trang web khác.")
    if request.headers.get("content-type", "").split(";", 1)[0].strip().lower() != "application/json":
        raise HTTPException(415, "Lệnh điều khiển phải là JSON.")


@app.post("/api/devices/{device_id}/thresholds", status_code=202)
def update_thresholds(request: Request, body: ThresholdUpdate,
                      device_id: str = ApiPath(pattern=r"^[A-Za-z0-9_-]{1,32}$"),
                      user: dict = Depends(require_roles("admin", "owner"))):
    check_control_request(request)
    try:
        item = control_item(device_id, user)
    except StorageError:
        raise HTTPException(503, "Chưa đọc được dữ liệu cảm biến.") from None
    if item is None:
        raise HTTPException(404, "Chưa có dữ liệu của ESP này.")
    return app.state.remote_control.submit(item, body, app.state.receiver.snapshot()["connected"], user)


@app.post("/api/devices/{device_id}/buzzer-test", status_code=202)
def test_buzzer(request: Request, body: BuzzerTestUpdate,
                device_id: str = ApiPath(pattern=r"^[A-Za-z0-9_-]{1,32}$"),
                user: dict = Depends(require_roles("admin", "owner"))):
    check_control_request(request)
    try:
        item = control_item(device_id, user)
    except StorageError:
        raise HTTPException(503, "Chưa đọc được dữ liệu cảm biến.") from None
    if item is None:
        raise HTTPException(404, "Chưa có dữ liệu của ESP này.")
    return app.state.buzzer_control.submit(item, body, app.state.receiver.snapshot()["connected"], user)


@app.get("/api/history")
def device_history(device_id: str = Query(pattern=r"^[A-Za-z0-9_-]{1,32}$"),
                   limit: int = Query(default=20, ge=1, le=100),
                   start_text: str | None = Query(default=None, alias="from"),
                   end_text: str | None = Query(default=None, alias="to"),
                   user: dict = Depends(get_current_user)):
    start, end = history_time(start_text), history_time(end_text)
    if start and end and start > end:
        raise HTTPException(422, "Thời gian bắt đầu phải trước hoặc bằng thời gian kết thúc.")
    try:
        items = history(device_id, limit, start, end, user=user)
    except StorageError:
        raise HTTPException(503, "Chưa đọc được lịch sử") from None
    return {"items": items}


def history_time(value):
    if value is None:
        return None
    try:
        if not re.fullmatch(r"\d{4}-\d{2}-\d{2}[Tt]\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:[Zz]|[+-]\d{2}:\d{2})", value):
            raise ValueError
        return datetime.fromisoformat(value.replace("z", "Z"))
    except ValueError:
        raise HTTPException(422, "Thời gian phải là ISO 8601 có múi giờ, ví dụ 2026-11-06T00:00:00Z.") from None


# --- Đăng ký thiết bị & quản lý vòng đời (Registry & Lifecycle) ---
from devices_api import router as devices_router  # noqa: E402
app.include_router(devices_router)
