"""Xác thực JWT và kiểm tra phạm vi phòng cho FastAPI.

Cài thư viện:  pip install pyjwt
Token cần có 2 trường: user_id, role  (role: admin | owner | ...)
"""
import os

import jwt
from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

SECRET_KEY = os.environ.get("JWT_SECRET", "doi-khoa-bi-mat-nay")
ALGORITHM = "HS256"

_bearer = HTTPBearer(auto_error=False)


def get_current_user(
    creds: HTTPAuthorizationCredentials | None = Depends(_bearer),
) -> dict:
    """Đọc header 'Authorization: Bearer <token>' và trả về payload."""
    if creds is None:
        raise HTTPException(401, "Thiếu token xác thực")
    try:
        payload = jwt.decode(creds.credentials, SECRET_KEY, algorithms=[ALGORITHM])
    except jwt.InvalidTokenError:
        raise HTTPException(401, "Token không hợp lệ hoặc đã hết hạn") from None
    if "user_id" not in payload or "role" not in payload:
        raise HTTPException(401, "Token thiếu user_id hoặc role")
    return payload


def require_roles(*roles: str):
    """Dependency: chỉ cho phép các role được liệt kê."""

    def dependency(user: dict = Depends(get_current_user)) -> dict:
        if roles and user["role"] not in roles:
            raise HTTPException(403, "Không đủ quyền thực hiện thao tác này")
        return user

    return dependency


def verify_room_access(cursor, user_id, role, room_id) -> bool:
    """True nếu user được quản lý phòng này.

    - admin: mọi phòng.
    - owner: chỉ phòng thuộc khu nhà (houses) do mình sở hữu.
    - role khác (tenant): không có quyền quản lý thiết bị.
    """
    if role == "admin":
        return True
    if role != "owner":
        return False
    cursor.execute(
        """SELECT 1 FROM rooms r
           JOIN houses h ON h.house_id = r.house_id
           WHERE r.room_id = %s AND h.owner_id = %s""",
        (room_id, user_id),
    )
    return cursor.fetchone() is not None