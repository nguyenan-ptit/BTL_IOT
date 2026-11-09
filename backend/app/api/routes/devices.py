"""Device registry, metadata, room assignment and lifecycle."""
import json
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi import Path as ApiPath
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict, Field, SecretStr, StrictBool

from app.core.legacy_auth import get_current_user, require_roles, verify_room_access
from app.db.device_storage import allowed_device, audit, command_history, public_row, session

router = APIRouter(prefix="/api/devices", tags=["devices"])
ID_PATTERN = r"^[A-Za-z0-9_-]{1,32}$"
LifecycleStatus = Literal["registered", "provisioned", "active", "maintenance", "blocked", "decommissioned"]
LIFECYCLE_TRANSITIONS = {
    "registered": {"provisioned", "blocked", "decommissioned"},
    "provisioned": {"active", "blocked", "decommissioned"},
    "active": {"maintenance", "blocked", "decommissioned"},
    "maintenance": {"active", "blocked", "decommissioned"},
    "blocked": {"active", "decommissioned"},
    "decommissioned": set(),
}


class StrictBody(BaseModel):
    model_config = ConfigDict(extra="forbid")


class RegisterRequest(StrictBody):
    device_id: str = Field(pattern=ID_PATTERN)
    device_name: str = Field(min_length=1, max_length=100)
    room_id: str = Field(min_length=1, max_length=20)
    mqtt_username: str = Field(min_length=1, max_length=64, pattern=r"^[A-Za-z0-9_-]+$")
    mqtt_client_id: str | None = Field(default=None, min_length=1, max_length=128)
    board_model: str | None = Field(default=None, max_length=64)
    hardware_version: str | None = Field(default=None, max_length=32)
    firmware_version: str | None = Field(default=None, max_length=64)


class MetadataRequest(StrictBody):
    device_name: str | None = Field(default=None, min_length=1, max_length=100)
    board_model: str | None = Field(default=None, max_length=64)
    hardware_version: str | None = Field(default=None, max_length=32)
    firmware_version: str | None = Field(default=None, max_length=64)
    mqtt_client_id: str | None = Field(default=None, min_length=1, max_length=128)


class RoomRequest(StrictBody):
    room_id: str = Field(min_length=1, max_length=20)


class LifecycleRequest(StrictBody):
    lifecycle_status: LifecycleStatus | None = None
    credential_status: Literal["pending", "active", "revoked"] | None = None
    maintenance_note: str | None = Field(default=None, max_length=500)


class CredentialRequest(StrictBody):
    action: Literal["provision", "reissue", "revoke"]
    password: SecretStr | None = Field(default=None, min_length=16, max_length=128)


class RetryRequest(StrictBody):
    password: SecretStr | None = Field(default=None, min_length=16, max_length=128)
class AttachExistingMqttRequest(StrictBody):
    mqtt_username: str = Field(
        min_length=1,
        max_length=64,
        pattern=r"^[A-Za-z0-9_-]+$",
    )
    connection_checked: StrictBool
    topic_permissions_checked: StrictBool
    verification_note: str = Field(min_length=10, max_length=500)

def _manage(cursor, user, device_id, *, allow_retired=False):
    device = allowed_device(cursor, user, device_id, lock=True)
    if not verify_room_access(cursor, user["user_id"], user["role"], device["room_id"]):
        raise HTTPException(403, "Bạn không quản lý phòng này.")
    if device["lifecycle_status"] == "decommissioned" and not allow_retired:
        raise HTTPException(409, "Thiết bị đã ngừng sử dụng, không thể thay đổi.")
    return device


def _room(cursor, user, room_id):
    cursor.execute("SELECT room_id FROM rooms WHERE room_id = %s", (room_id,))
    if not cursor.fetchone():
        raise HTTPException(404, "Mã phòng không tồn tại.")
    if not verify_room_access(cursor, user["user_id"], user["role"], room_id):
        raise HTTPException(403, "Bạn không quản lý phòng này.")


@router.post("/register", status_code=201)
def register_device(body: RegisterRequest, user: dict = Depends(require_roles("admin", "owner"))):
    with session() as cursor:
        _room(cursor, user, body.room_id)
        cursor.execute("SELECT 1 FROM devices WHERE device_id = %s OR mqtt_username = %s",
                       (body.device_id, body.mqtt_username))
        if cursor.fetchone():
            raise HTTPException(409, "Trùng device_id hoặc mqtt_username.")
        cursor.execute(
            "INSERT INTO devices (device_id, room_id, device_name, board_model, mqtt_username, mqtt_client_id, "
            "credential_status, lifecycle_status, hardware_version, firmware_version, registered_by) "
            "VALUES (%s,%s,%s,%s,%s,%s,'pending','registered',%s,%s,%s)",
            (body.device_id, body.room_id, body.device_name, body.board_model, body.mqtt_username,
             body.mqtt_client_id, body.hardware_version, body.firmware_version, user["user_id"]))
        audit(cursor, user["user_id"], body.room_id, "REGISTER_DEVICE", body.device_id,
              {"device_name": body.device_name})
    return {"status": "success", "device_id": body.device_id,
            "lifecycle_status": "registered", "credential_status": "pending"}


@router.get("/{device_id}/commands")
def device_commands(device_id: str = ApiPath(pattern=ID_PATTERN),
                    limit: int = Query(default=20, ge=1, le=100),
                    user: dict = Depends(get_current_user)):
    # Authorization uses the command's recorded room, even after a device move.
    return {"items": command_history(device_id, limit, user)}


@router.get("/{device_id}")
def get_device(device_id: str = ApiPath(pattern=ID_PATTERN),
               user: dict = Depends(get_current_user)):
    with session() as cursor:
        return public_row(allowed_device(cursor, user, device_id))


@router.patch("/{device_id}")
def update_metadata(body: MetadataRequest, device_id: str = ApiPath(pattern=ID_PATTERN),
                    user: dict = Depends(require_roles("admin", "owner"))):
    changes = body.model_dump(exclude_unset=True)
    if not changes or changes.get("device_name", "") is None:
        raise HTTPException(400, "Cần cung cấp thông tin thay đổi hợp lệ.")
    with session() as cursor:
        device = _manage(cursor, user, device_id)
        if device["mqtt_sync_status"] == "pending":
            raise HTTPException(409, "Đang đồng bộ MQTT; thử lại sau.")
        cursor.execute("UPDATE devices SET " + ", ".join(key + " = %s" for key in changes) +
                       " WHERE device_id = %s", (*changes.values(), device_id))
        audit(cursor, user["user_id"], device["room_id"], "UPDATE_DEVICE", device_id, changes)
    return {"status": "success", "device_id": device_id, **changes}


@router.patch("/{device_id}/room")
def move_device(body: RoomRequest, device_id: str = ApiPath(pattern=ID_PATTERN),
                user: dict = Depends(require_roles("admin", "owner"))):
    with session() as cursor:
        device = _manage(cursor, user, device_id)
        _room(cursor, user, body.room_id)
        if device["mqtt_sync_status"] in ("pending", "failed"):
            raise HTTPException(409, "Cần hoàn tất thao tác MQTT trước khi chuyển phòng.")
        if device["room_id"] == body.room_id:
            raise HTTPException(409, "Thiết bị đã ở phòng này.")
        # Existing history/incidents/commands are deliberately never updated.
        cursor.execute("UPDATE devices SET room_id = %s WHERE device_id = %s", (body.room_id, device_id))
        cursor.execute("UPDATE device_commands SET status = 'interrupted', finished_at = UTC_TIMESTAMP(), "
                       "error_message = 'device_room_changed' WHERE device_id = %s "
                       "AND status IN ('queued', 'pending', 'running', 'unconfirmed')", (device_id,))
        audit(cursor, user["user_id"], device["room_id"], "MOVE_DEVICE", device_id,
              {"from_room_id": device["room_id"], "to_room_id": body.room_id})
    return {"status": "success", "device_id": device_id, "room_id": body.room_id}


def _operation_response(operation):
    return JSONResponse(status_code=200 if operation["status"] == "succeeded" else 202,
                        content=operation, headers={"Cache-Control": "no-store"})


def _can_resume_backend(cursor, device):
    """Resume an existing active node without claiming broker synchronization.

    The pause is recorded durably so a restart or a note edit cannot lose it.
    A registered/never-activated node or a changed MQTT identity cannot use this
    exception to the normal provisioning requirement.
    """
    if (device["lifecycle_status"] not in ("blocked", "maintenance")
            or device["credential_status"] != "active"
            or device["mqtt_sync_status"] != "unknown"
            or device["mqtt_operation_id"] is not None):
        return False
    cursor.execute("SELECT details FROM audit_logs WHERE target_type = 'device' "
                   "AND target_id = %s AND action = 'UPDATE_LIFECYCLE' ORDER BY log_id DESC",
                   (device["device_id"],))
    expected = device["lifecycle_status"]
    for row in cursor.fetchall():
        details = row["details"]
        if isinstance(details, str):
            details = json.loads(details)
        if not isinstance(details, dict):
            return False
        if details.get("from") == details.get("to"):
            continue  # Updating a maintenance note does not replace the pause.
        if (details.get("to") != expected
                or details.get("credential_status") != "active"
                or details.get("mqtt_sync_status") != "unknown"
                or details.get("mqtt_username") != device["mqtt_username"]
                or "mqtt_operation_id" not in details
                or details["mqtt_operation_id"] is not None):
            return False
        if details.get("from") == "active":
            return True
        if details.get("from") not in ("blocked", "maintenance"):
            return False
        expected = details["from"]
    return False


@router.patch("/{device_id}/lifecycle")
def update_device_lifecycle(body: LifecycleRequest, request: Request,
                            device_id: str = ApiPath(pattern=ID_PATTERN),
                            user: dict = Depends(require_roles("admin", "owner"))):
    if body.credential_status in ("active", "pending"):
        raise HTTPException(409, "Cấp thông tin MQTT qua POST /api/devices/{device_id}/mqtt-credentials.")
    if body.credential_status == "revoked" or body.lifecycle_status == "decommissioned":
        if body.lifecycle_status not in (None, "blocked", "decommissioned"):
            raise HTTPException(409, "Thu hồi cần khóa hoặc ngừng sử dụng thiết bị.")
        from app.services.mqtt_lifecycle import request_operation
        return _operation_response(request_operation(
            request.app.state.emqx_admin, user, device_id, "revoke",
            retire=body.lifecycle_status == "decommissioned", note=body.maintenance_note))
    with session() as cursor:
        device = _manage(cursor, user, device_id)
        if device["mqtt_sync_status"] in ("pending", "failed"):
            raise HTTPException(409, "Cần hoàn tất thao tác MQTT trước khi đổi vòng đời.")
        updates, params = [], []
        new = body.lifecycle_status
        if new:
            if new not in LIFECYCLE_TRANSITIONS[device["lifecycle_status"]]:
                raise HTTPException(409, "Chuyển trạng thái vòng đời không hợp lệ.")
            if new == "active":
                if (
                    device["credential_status"] != "active"
                    or (
                        device["mqtt_sync_status"]
                        not in ("synced", "manual_verified")
                        and not _can_resume_backend(cursor, device)
                        )
                    ):
                    raise HTTPException(
                        409,
                        "Cần cấp MQTT thành công hoặc xác nhận tài khoản có sẵn "
                        "trước khi kích hoạt.",
                    )
            updates.append("lifecycle_status = %s")
            params.append(new)
            if new == "active":
                updates.append("activated_at = COALESCE(activated_at, UTC_TIMESTAMP())")
        if body.maintenance_note is not None:
            updates.append("maintenance_note = %s")
            params.append(body.maintenance_note)
        if not updates:
            raise HTTPException(400, "Không có thông tin thay đổi.")
        cursor.execute("UPDATE devices SET " + ", ".join(updates) + " WHERE device_id = %s", (*params, device_id))
        if new in ("blocked", "maintenance"):
            cursor.execute("UPDATE device_commands SET status = 'interrupted', finished_at = UTC_TIMESTAMP(), "
                           "error_message = 'device_lifecycle_changed' WHERE device_id = %s "
                           "AND status IN ('queued', 'pending', 'running', 'unconfirmed')", (device_id,))
        audit(cursor, user["user_id"], device["room_id"], "UPDATE_LIFECYCLE", device_id,
              {"from": device["lifecycle_status"], "to": new or device["lifecycle_status"],
               "credential_status": device["credential_status"], "mqtt_username": device["mqtt_username"],
               "mqtt_sync_status": device["mqtt_sync_status"], "mqtt_operation_id": device["mqtt_operation_id"],
               "maintenance_note": body.maintenance_note})
    return {"status": "success", "device_id": device_id,
            "lifecycle_status": new or device["lifecycle_status"],
            "credential_status": device["credential_status"], "mqtt_sync_status": device["mqtt_sync_status"]}


@router.post("/{device_id}/mqtt-credentials")
def mqtt_credentials(body: CredentialRequest, request: Request,
                     device_id: str = ApiPath(pattern=ID_PATTERN),
                     user: dict = Depends(require_roles("admin", "owner"))):
    from app.services.mqtt_lifecycle import request_operation
    password = body.password.get_secret_value() if body.password else None
    return _operation_response(request_operation(request.app.state.emqx_admin, user, device_id, body.action, password))


@router.get("/{device_id}/mqtt-operations/{operation_id}")
def mqtt_operation(device_id: str = ApiPath(pattern=ID_PATTERN),
                   operation_id: str = ApiPath(pattern=r"^[0-9a-f]{32}$"),
                   user: dict = Depends(require_roles("admin", "owner"))):
    from app.services.mqtt_lifecycle import get_operation
    return get_operation(user, device_id, operation_id)


@router.post("/{device_id}/mqtt-operations/{operation_id}/retry")
def retry_mqtt(body: RetryRequest, request: Request,
               device_id: str = ApiPath(pattern=ID_PATTERN),
               operation_id: str = ApiPath(pattern=r"^[0-9a-f]{32}$"),
               user: dict = Depends(require_roles("admin", "owner"))):
    from app.services.mqtt_lifecycle import run_operation
    password = body.password.get_secret_value() if body.password else None
    return _operation_response(run_operation(request.app.state.emqx_admin, user, device_id, operation_id, password))
@router.post("/{device_id}/mqtt-credentials/attach-existing")
def attach_existing_mqtt(
    body: AttachExistingMqttRequest,
    request: Request,
    device_id: str = ApiPath(pattern=ID_PATTERN),
    user: dict = Depends(require_roles("admin")),
):
    if not (
        body.connection_checked
        and body.topic_permissions_checked
    ):
        raise HTTPException(
            400,
            "Cần kiểm tra kết nối và quyền topic trên EMQX trước.",
        )

    note = body.verification_note.strip()
    if len(note) < 10:
        raise HTTPException(422, "Cần ghi rõ kết quả kiểm tra.")

    # Không được dùng tài khoản MQTT của backend cho node.
    backend_username = request.app.state.config.get("mqtt_username")
    if body.mqtt_username == backend_username:
        raise HTTPException(
            409,
            "Node phải dùng tài khoản riêng, không dùng tài khoản backend.",
        )

    with session() as cursor:
        device = _manage(cursor, user, device_id)

        # Chỉ áp dụng cấp lần đầu cho node mới.
        if (
            device["lifecycle_status"] not in ("registered", "provisioned")
            or device["credential_status"] != "pending"
            or device["mqtt_sync_status"] != "unknown"
            or device["mqtt_operation_id"] is not None
        ):
            raise HTTPException(
                409,
                "Node không ở trạng thái cấp lần đầu. "
                "Không dùng thao tác này để bỏ qua cấp/thu hồi MQTT dở dang.",
            )

        if body.mqtt_username != device["mqtt_username"]:
            raise HTTPException(
                409,
                "Username phải khớp tài khoản đã khai báo khi đăng ký node.",
            )

        cursor.execute(
            "UPDATE devices "
            "SET credential_status = 'active', "
            "lifecycle_status = 'provisioned', "
            "mqtt_sync_status = 'manual_verified' "
            "WHERE device_id = %s",
            (device_id,),
        )

        audit(
            cursor,
            user["user_id"],
            device["room_id"],
            "ATTACH_EXISTING_MQTT",
            device_id,
            {
                "mqtt_username": body.mqtt_username,
                "verification_method": "manual",
                "connection_checked": True,
                "topic_permissions_checked": True,
                "verification_note": note,
                "summary": "Xác nhận tài khoản MQTT có sẵn cho node",
            },
        )

    return {
        "status": "success",
        "device_id": device_id,
        "mqtt_username": body.mqtt_username,
        "credential_status": "active",
        "lifecycle_status": "provisioned",
        "mqtt_sync_status": "manual_verified",
    }
