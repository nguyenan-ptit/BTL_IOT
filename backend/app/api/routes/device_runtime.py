import re
from datetime import datetime
from urllib.parse import urlsplit

from fastapi import APIRouter, Depends, HTTPException, Path as ApiPath, Query, Request

from app.core.legacy_auth import get_current_user as legacy_get_current_user
from app.core.legacy_auth import require_roles as legacy_require_roles
from app.db.device_storage import (StorageError, allowed_device, history, read_latest, session)
from app.integrations.mqtt.buzzer_control import BuzzerTestUpdate
from app.integrations.mqtt.remote_control import ThresholdUpdate

router = APIRouter()


@router.get("/api/health")
def mqtt_health(request: Request):
    return {"mqtt": request.app.state.receiver.snapshot(),
            "discovery": request.app.state.discovery.snapshot(), "prototype": True}


@router.get("/api/devices")
def legacy_device_list(request: Request, user: dict = Depends(legacy_get_current_user)):
    try:
        items = read_latest(user)
    except StorageError:
        raise HTTPException(503, "Chưa đọc được dữ liệu cảm biến") from None
    for item in items:
        item["can_control"] = (user["role"] in ("admin", "owner") and item["lifecycle_status"] == "active"
                               and item["credential_status"] == "active"
                               and item["device"]["mqtt_sync_status"] not in ("pending", "failed"))
        item["remote_control"] = request.app.state.remote_control.snapshot(item)
        item["buzzer_control"] = request.app.state.buzzer_control.snapshot(item)
    return {"items": items, "mqtt": request.app.state.receiver.snapshot(), "prototype": True}


@router.get("/api/admin/mqtt-capabilities")
def mqtt_capabilities(request: Request, user: dict = Depends(legacy_require_roles("admin"))):
    return request.app.state.emqx_admin.capabilities()


def control_item(device_id, user, application):
    if not getattr(application.state, "command_worker_ready", True):
        raise HTTPException(503, "Bộ xử lý lệnh chưa sẵn sàng; cần khởi động lại backend.")
    with session() as cursor:
        allowed_device(cursor, user, device_id, control=True)
    item = next((item for item in read_latest(user) if item["device_id"] == device_id), None)
    if item is None or item["data"] is None:
        raise HTTPException(404, "Chưa có telemetry của thiết bị trong phòng hiện tại.")
    return item


def check_control_request(request: Request):
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


@router.post("/api/devices/{device_id}/thresholds", status_code=202)
def update_thresholds(request: Request, body: ThresholdUpdate,
                      device_id: str = ApiPath(pattern=r"^[A-Za-z0-9_-]{1,32}$"),
                      user: dict = Depends(legacy_require_roles("admin", "owner"))):
    check_control_request(request)
    try:
        item = control_item(device_id, user, request.app)
    except StorageError:
        raise HTTPException(503, "Chưa đọc được dữ liệu cảm biến.") from None
    return request.app.state.remote_control.submit(item, body, request.app.state.receiver.snapshot()["connected"], user)


@router.post("/api/devices/{device_id}/buzzer-test", status_code=202)
def test_buzzer(request: Request, body: BuzzerTestUpdate,
                device_id: str = ApiPath(pattern=r"^[A-Za-z0-9_-]{1,32}$"),
                user: dict = Depends(legacy_require_roles("admin", "owner"))):
    check_control_request(request)
    try:
        item = control_item(device_id, user, request.app)
    except StorageError:
        raise HTTPException(503, "Chưa đọc được dữ liệu cảm biến.") from None
    return request.app.state.buzzer_control.submit(item, body, request.app.state.receiver.snapshot()["connected"], user)


@router.get("/api/history")
def device_history(device_id: str = Query(pattern=r"^[A-Za-z0-9_-]{1,32}$"),
                   limit: int = Query(default=20, ge=1, le=100),
                   start_text: str | None = Query(default=None, alias="from"),
                   end_text: str | None = Query(default=None, alias="to"),
                   user: dict = Depends(legacy_get_current_user)):
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
