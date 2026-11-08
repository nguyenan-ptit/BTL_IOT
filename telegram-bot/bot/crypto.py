"""Mã hoá mật khẩu người dùng trước khi lưu (Fernet, khoá trong BOT_SECRET_KEY)."""
from cryptography.fernet import Fernet


def encrypt(key: str, text: str) -> str:
    return Fernet(key.encode()).encrypt(text.encode()).decode()


def decrypt(key: str, token: str) -> str:
    return Fernet(key.encode()).decrypt(token.encode()).decode()
