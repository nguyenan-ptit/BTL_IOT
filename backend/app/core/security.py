
from datetime import datetime, timedelta, timezone

import jwt
from pwdlib import PasswordHash

from app.core.config import settings


# Khởi tạo bộ băm mật khẩu Argon2
password_hash = PasswordHash.recommended()


def hash_password(password: str) -> str:
    """Băm mật khẩu trước khi lưu vào database."""
    return password_hash.hash(password)


def verify_password(
    plain_password: str,
    hashed_password: str,
) -> bool:
    """Kiểm tra mật khẩu người dùng nhập."""
    return password_hash.verify(plain_password, hashed_password)


def create_access_token(
    user_id: int,
    username: str,
    role: str,
) -> str:
    """Tạo JWT access token."""
    now = datetime.now(timezone.utc)

    expire = now + timedelta(
        minutes=settings.access_token_expire_minutes
    )

    payload = {
        "sub": str(user_id),
        "username": username,
        "role": role,
        "iat": now,
        "exp": expire,
    }

    return jwt.encode(
        payload,
        settings.jwt_secret_key,
        algorithm=settings.jwt_algorithm,
    )


def decode_access_token(token: str) -> dict:
    """Xác minh chữ ký và thời hạn JWT."""
    return jwt.decode(
        token,
        settings.jwt_secret_key,
        algorithms=[settings.jwt_algorithm],
    )
