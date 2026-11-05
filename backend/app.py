import logging
import re
import threading
from contextlib import asynccontextmanager
from pathlib import Path
from urllib.parse import urlsplit

import paho.mqtt.client as mqtt
import pymysql
from fastapi import FastAPI, HTTPException, Query, Request, Path as ApiPath
from fastapi.exceptions import RequestValidationError
from fastapi.responses import FileResponse, JSONResponse

from settings import load_settings
from storage import configure as configure_storage, initialize, save, read_latest, history
from validation import validate_message
from remote_control import RemoteController, ThresholdUpdate
from buzzer_control import BuzzerController, BuzzerTestUpdate
from discovery import DiscoveryResponder

logger = logging.getLogger("iot_full")
HERE = Path(__file__).resolve().parent
TELEMETRY_TOPIC = re.compile(r"iot/devices/([A-Za-z0-9_-]{1,32})/telemetry\Z")


class Receiver:
    def __init__(self, config):
        self.config = config
        self.lock = threading.Lock()
        self.status = {"connected": False, "accepted": 0, "rejected": 0, "last_error": None}
        self.client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2, client_id="iot-full-backend")
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
        except pymysql.MySQLError as exc:
            self.update(last_error="Không ghi được MySQL; kiểm tra kết nối, tài khoản và quyền ghi")
            # Chỉ log loại lỗi/mã lỗi, không log payload hay thông tin đăng nhập.
            logger.error("MySQL write failed: %s (%s)", type(exc).__name__, exc.args[0] if exc.args else "?")
            return
        if inserted:
            with self.lock:
                self.status["accepted"] += 1
                self.status["last_error"] = None

    def start(self):
        self.client.connect_async(self.config["mqtt_host"], self.config["mqtt_port"], keepalive=30)
        self.client.loop_start()

    def stop(self):
        self.client.disconnect()
        self.client.loop_stop()


@asynccontextmanager
async def lifespan(app):
    config = load_settings()
    configure_storage(config["mysql"])
    initialize()
    app.state.config = config
    app.state.receiver = Receiver(config)
    app.state.remote_control = RemoteController(app.state.receiver.client)
    app.state.buzzer_control = BuzzerController(app.state.receiver.client)
    app.state.discovery = DiscoveryResponder(config, lambda: app.state.receiver.snapshot()["connected"])
    app.state.receiver.start()
    app.state.discovery.start()
    try:
        yield
    finally:
        app.state.discovery.stop()
        app.state.receiver.stop()


app = FastAPI(title="Theo dõi cảm biến phòng trọ — bản thử", lifespan=lifespan)


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
def devices():
    try:
        items = read_latest()
    except pymysql.MySQLError:
        raise HTTPException(503, "Chưa đọc được dữ liệu cảm biến") from None
    for item in items:
        item["remote_control"] = app.state.remote_control.snapshot(item)
        item["buzzer_control"] = app.state.buzzer_control.snapshot(item)
    return {"items": items, "mqtt": app.state.receiver.snapshot(), "prototype": True}


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
                      device_id: str = ApiPath(pattern=r"^[A-Za-z0-9_-]{1,32}$")):
    check_control_request(request)
    try:
        item = next((item for item in read_latest()
                     if item["data"]["device_id"] == device_id), None)
    except pymysql.MySQLError:
        raise HTTPException(503, "Chưa đọc được dữ liệu cảm biến.") from None
    if item is None:
        raise HTTPException(404, "Chưa có dữ liệu của ESP này.")
    return app.state.remote_control.submit(item, body, app.state.receiver.snapshot()["connected"])


@app.post("/api/devices/{device_id}/buzzer-test", status_code=202)
def test_buzzer(request: Request, body: BuzzerTestUpdate,
                device_id: str = ApiPath(pattern=r"^[A-Za-z0-9_-]{1,32}$")):
    check_control_request(request)
    try:
        item = next((item for item in read_latest()
                     if item["data"]["device_id"] == device_id), None)
    except pymysql.MySQLError:
        raise HTTPException(503, "Chưa đọc được dữ liệu cảm biến.") from None
    if item is None:
        raise HTTPException(404, "Chưa có dữ liệu của ESP này.")
    return app.state.buzzer_control.submit(item, body, app.state.receiver.snapshot()["connected"])


@app.get("/api/history")
def device_history(device_id: str = Query(pattern=r"^[A-Za-z0-9_-]{1,32}$"),
                   limit: int = Query(default=20, ge=1, le=100)):
    try:
        items = history(device_id, limit)
    except pymysql.MySQLError:
        raise HTTPException(503, "Chưa đọc được lịch sử") from None
    return {"items": items}


