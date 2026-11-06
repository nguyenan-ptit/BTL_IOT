"""API Đăng ký & Quản lý vòng đời thiết bị (Registry & Lifecycle).

Gắn vào app.py (FastAPI):
    from devices_api import router as devices_router
    app.include_router(devices_router)
"""
import json
from typing import Literal, Optional

import pymysql
from fastapi import APIRouter, Depends, HTTPException
from fastapi import Path as ApiPath
from pydantic import BaseModel, Field

from auth import require_roles, verify_room_access
from storage import StorageError, session

router = APIRouter(prefix="/api/devices", tags=["devices"])

ID_PATTERN = r"^[A-Za-z0-9_-]{1,32}$"

LifecycleStatus = Literal[
    "registered", "provisioned", "active", "maintenance", "blocked", "decommissioned"
]
CredentialStatus = Literal["pending", "active", "revoked"]

# ---------------------------------------------------------------------------
# Ràng buộc chuyển đổi trạng thái hợp lệ
#   registered   : vừa đăng ký, chưa cấp credential
#   provisioned  : đã nạp cấu hình/credential, chờ kích hoạt
#   active       : đang hoạt động
#   maintenance  : đang bảo trì
#   blocked      : tạm khóa (có thể mở khóa -> active)
#   decommissioned: ngừng sử dụng (trạng thái cuối, không đổi được nữa)
# ---------------------------------------------------------------------------
LIFECYCLE_TRANSITIONS = {
    "registered": {"provisioned", "blocked", "decommissioned"},
    "provisioned": {"active", "blocked", "decommissioned"},
    "active": {"maintenance", "blocked", "decommissioned"},
    "maintenance": {"active", "blocked", "decommissioned"},
    "blocked": {"active", "decommissioned"},  # blocked -> active = mở khóa
    "decommissioned": set(),
}

# pending -> active (cấp) | pending/active -> revoked (thu hồi). revoked là cuối.
CREDENTIAL_TRANSITIONS = {
    "pending": {"active", "revoked"},
    "active": {"revoked"},
    "revoked": set(),
}


class RegisterRequest(BaseModel):
    device_id: str = Field(pattern=ID_PATTERN)
    device_name: str = Field(min_length=1, max_length=100)
    room_id: str = Field(min_length=1, max_length=20)
    mqtt_username: str = Field(min_length=1, max_length=64)
    board_model: Optional[str] = Field(default=None, max_length=64)
    hardware_version: Optional[str] = Field(default=None, max_length=32)
    firmware_version: Optional[str] = Field(default=None, max_length=64)


class LifecycleRequest(BaseModel):
    lifecycle_status: Optional[LifecycleStatus] = None
    credential_status: Optional[CredentialStatus] = None
    maintenance_note: Optional[str] = Field(default=None, max_length=500)


def _audit(cursor, user_id, room_id, action, device_id, details):
    cursor.execute(
        """
        INSERT INTO audit_logs
            (actor_user_id, room_id, action, target_type, target_id, result, details)
        VALUES (%s, %s, %s, 'device', %s, 'success', %s)
        """,
        (user_id, room_id, action, device_id, json.dumps(details, ensure_ascii=False)),
    )


def _is_integrity_error(exc) -> bool:
    """True nếu exc hoặc nguyên nhân gốc của nó là pymysql IntegrityError."""
    seen = 0
    while exc is not None and seen < 5:
        if isinstance(exc, pymysql.err.IntegrityError) or getattr(exc, "errno", None) == 1062:
            return True  # 1062 = duplicate entry (storage.session bọc lỗi thành StorageError)
        exc = exc.__cause__ or exc.__context__
        seen += 1
    return False


def _check_room(cursor, user, room_id):
    if not verify_room_access(cursor, user["user_id"], user["role"], room_id):
        raise HTTPException(403, "Truy cập bị từ chối: bạn không quản lý phòng này.")


# ---------------------------------------------------------------------------
# 1. Đăng ký node
# ---------------------------------------------------------------------------
@router.post("/register", status_code=201)
def register_device(
    body: RegisterRequest,
    user: dict = Depends(require_roles("admin", "owner")),
):
    """Đăng ký node mới, lưu ID + mqtt_username (chỉ tham chiếu, KHÔNG lưu mật khẩu)
    và gán vào phòng thuộc phạm vi quyền của người gọi."""
    try:
        with session() as cursor:
            cursor.execute("SELECT room_id FROM rooms WHERE room_id = %s", (body.room_id,))
            if not cursor.fetchone():
                raise HTTPException(404, "Mã phòng (room_id) không tồn tại.")

            _check_room(cursor, user, body.room_id)

            cursor.execute(
                "SELECT 1 FROM devices WHERE device_id = %s OR mqtt_username = %s",
                (body.device_id, body.mqtt_username),
            )
            if cursor.fetchone():
                raise HTTPException(409, "Trùng device_id hoặc mqtt_username.")

            cursor.execute(
                """
                INSERT INTO devices (
                    device_id, room_id, device_name, board_model, mqtt_username,
                    credential_status, lifecycle_status,
                    hardware_version, firmware_version, registered_by
                ) VALUES (%s, %s, %s, %s, %s, 'pending', 'registered', %s, %s, %s)
                """,
                (
                    body.device_id, body.room_id, body.device_name, body.board_model,
                    body.mqtt_username, body.hardware_version, body.firmware_version,
                    user["user_id"],
                ),
            )
            _audit(cursor, user["user_id"], body.room_id, "REGISTER_DEVICE",
                   body.device_id, {"device_name": body.device_name})
    except HTTPException:
        raise
    except Exception as exc:
        if _is_integrity_error(exc):  # hai request cùng lúc, lọt qua bước kiểm tra
            raise HTTPException(409, "Trùng device_id hoặc mqtt_username.") from None
        if isinstance(exc, StorageError):
            raise HTTPException(503, "Không ghi được vào cơ sở dữ liệu.") from None
        raise

    return {
        "status": "success",
        "message": "Đăng ký thiết bị thành công.",
        "device_id": body.device_id,
        "lifecycle_status": "registered",
        "credential_status": "pending",
    }


# ---------------------------------------------------------------------------
# 2. Xem thiết bị
# ---------------------------------------------------------------------------
@router.get("/{device_id}")
def get_device(
    device_id: str = ApiPath(pattern=ID_PATTERN),
    user: dict = Depends(require_roles("admin", "owner")),
):
    with session() as cursor:
        cursor.execute(
            """SELECT device_id, room_id, device_name, board_model, mqtt_username,
                      credential_status, lifecycle_status, maintenance_note
               FROM devices WHERE device_id = %s""",
            (device_id,),
        )
        device = cursor.fetchone()
        if not device:
            raise HTTPException(404, "Không tìm thấy thiết bị.")
        _check_room(cursor, user, device["room_id"])
    return device


# ---------------------------------------------------------------------------
# 3. Vòng đời: kích hoạt / bảo trì / khóa-mở khóa / thu hồi / ngừng sử dụng
# ---------------------------------------------------------------------------
@router.patch("/{device_id}/lifecycle")
def update_device_lifecycle(
    body: LifecycleRequest,
    device_id: str = ApiPath(pattern=ID_PATTERN),
    user: dict = Depends(require_roles("admin", "owner")),
):
    """Ví dụ:
      kích hoạt   : {"lifecycle_status": "active", "credential_status": "active"}
      bảo trì     : {"lifecycle_status": "maintenance", "maintenance_note": "..."}
      tạm khóa    : {"lifecycle_status": "blocked"}
      mở khóa     : {"lifecycle_status": "active"}      (từ blocked)
      thu hồi     : {"credential_status": "revoked"}
      ngừng dùng  : {"lifecycle_status": "decommissioned"}  (tự thu hồi credential)
    """
    if (body.lifecycle_status is None and body.credential_status is None
            and body.maintenance_note is None):
        raise HTTPException(400, "Không có thông tin thay đổi nào được cung cấp.")

    with session() as cursor:
        # FOR UPDATE: khóa dòng để 2 request đồng thời không phá ràng buộc
        cursor.execute(
            """SELECT room_id, lifecycle_status, credential_status
               FROM devices WHERE device_id = %s FOR UPDATE""",
            (device_id,),
        )
        device = cursor.fetchone()
        if not device:
            raise HTTPException(404, "Không tìm thấy thiết bị.")

        _check_room(cursor, user, device["room_id"])

        cur_l, cur_c = device["lifecycle_status"], device["credential_status"]
        new_l, new_c = body.lifecycle_status, body.credential_status

        if cur_l == "decommissioned":
            raise HTTPException(409, "Thiết bị đã ngừng sử dụng, không thể thay đổi.")

        # --- kiểm tra chuyển trạng thái vòng đời ---
        if new_l is not None:
            if new_l == cur_l:
                raise HTTPException(409, f"Thiết bị đã ở trạng thái '{cur_l}'.")
            if new_l not in LIFECYCLE_TRANSITIONS[cur_l]:
                allowed = sorted(LIFECYCLE_TRANSITIONS[cur_l])
                raise HTTPException(
                    409, f"Không thể chuyển '{cur_l}' -> '{new_l}'. Cho phép: {allowed}")

        # ngừng sử dụng thì bắt buộc thu hồi credential
        if new_l == "decommissioned":
            if new_c not in (None, "revoked"):
                raise HTTPException(400, "Ngừng sử dụng thì credential phải là 'revoked'.")
            new_c = "revoked"

        # --- kiểm tra chuyển trạng thái credential ---
        if new_c is not None:
            if new_c == cur_c:
                new_c = None  # không đổi gì, bỏ qua
            elif new_c not in CREDENTIAL_TRANSITIONS[cur_c]:
                allowed = sorted(CREDENTIAL_TRANSITIONS[cur_c])
                raise HTTPException(
                    409, f"Không thể chuyển credential '{cur_c}' -> '{new_c}'. Cho phép: {allowed}")

        # kích hoạt/mở khóa cần credential đang active
        effective_c = new_c or cur_c
        if new_l == "active" and effective_c != "active":
            raise HTTPException(
                409, "Cần credential_status = 'active' trước khi kích hoạt/mở khóa thiết bị.")

        # --- cập nhật ---
        updates, params = [], []
        if new_l is not None:
            updates.append("lifecycle_status = %s")
            params.append(new_l)
            if new_l == "active":
                updates.append("activated_at = COALESCE(activated_at, NOW())")
            elif new_l == "decommissioned":
                updates.append("decommissioned_at = NOW()")
        if new_c is not None:
            updates.append("credential_status = %s")
            params.append(new_c)
        if body.maintenance_note is not None:
            updates.append("maintenance_note = %s")
            params.append(body.maintenance_note)

        if not updates:
            raise HTTPException(409, "Không có thay đổi nào so với trạng thái hiện tại.")

        params.append(device_id)
        cursor.execute(
            f"UPDATE devices SET {', '.join(updates)} WHERE device_id = %s",
            tuple(params),
        )

        _audit(cursor, user["user_id"], device["room_id"], "UPDATE_LIFECYCLE", device_id, {
            "lifecycle": [cur_l, new_l or cur_l],
            "credential": [cur_c, new_c or cur_c],
            "maintenance_note": body.maintenance_note,
        })

    return {
        "status": "success",
        "message": f"Đã cập nhật thiết bị {device_id}.",
        "lifecycle_status": new_l or cur_l,
        "credential_status": new_c or cur_c,
    }