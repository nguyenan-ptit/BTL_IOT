"""JWT adapter and room permissions shared by backend APIs.

Login/token issuance remains the responsibility of the account service.
"""
import os

import jwt
from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

ALGORITHM = "HS256"
_bearer = HTTPBearer(auto_error=False)


def get_current_user(creds: HTTPAuthorizationCredentials | None = Depends(_bearer)) -> dict:
    if creds is None:
        raise HTTPException(401, "Thiếu token xác thực", headers={"WWW-Authenticate": "Bearer"})
    secret = os.environ.get("JWT_SECRET", "")
    if len(secret) < 32 or secret == "doi-khoa-bi-mat-nay":
        raise HTTPException(503, "Chưa cấu hình khóa xác thực của backend.")
    try:
        payload = jwt.decode(creds.credentials, secret, algorithms=[ALGORITHM],
                             options={"require": ["exp", "user_id", "role"]})
    except jwt.InvalidTokenError:
        raise HTTPException(401, "Token không hợp lệ hoặc đã hết hạn") from None
    if type(payload["user_id"]) is not int or payload["user_id"] <= 0:
        raise HTTPException(401, "Token có user_id không hợp lệ")
    from app.db.device_storage import session
    with session() as cursor:
        cursor.execute("SELECT user_id, role, status FROM users WHERE user_id = %s", (payload["user_id"],))
        account = cursor.fetchone()
    if not account or account["status"] != "active" or account["role"] != payload["role"]:
        raise HTTPException(401, "Tài khoản không hoạt động hoặc quyền đã thay đổi")
    return {"user_id": account["user_id"], "role": account["role"]}


def require_roles(*roles: str):
    def dependency(user: dict = Depends(get_current_user)) -> dict:
        if roles and user["role"] not in roles:
            raise HTTPException(403, "Không đủ quyền thực hiện thao tác này")
        return user
    return dependency


def room_scope(user, column, *, manage=False):
    """column is an internal SQL constant. History callers use the recorded room."""
    if user["role"] == "admin":
        return "1 = 1", ()
    if user["role"] == "owner":
        return (f"EXISTS (SELECT 1 FROM rooms scope_r JOIN houses scope_h "
                f"ON scope_h.house_id = scope_r.house_id "
                f"WHERE scope_r.room_id = {column} AND scope_h.owner_id = %s)",
                (user["user_id"],))
    if user["role"] == "tenant" and not manage:
        return (f"EXISTS (SELECT 1 FROM room_users scope_ru WHERE scope_ru.room_id = {column} "
                "AND scope_ru.user_id = %s AND scope_ru.started_at <= UTC_TIMESTAMP() "
                "AND (scope_ru.ended_at IS NULL OR scope_ru.ended_at > UTC_TIMESTAMP()))",
                (user["user_id"],))
    return "1 = 0", ()


def verify_room_access(cursor, user_id, role, room_id, *, manage=True) -> bool:
    if role == "admin":
        return True
    if room_id is None:
        return False
    condition, params = room_scope({"user_id": user_id, "role": role}, "r.room_id", manage=manage)
    cursor.execute(f"SELECT 1 FROM rooms r WHERE r.room_id = %s AND ({condition})", (room_id, *params))
    return cursor.fetchone() is not None
