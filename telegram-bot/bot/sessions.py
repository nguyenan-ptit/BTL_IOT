"""Giữ token của từng tài khoản; tự đăng nhập lại bằng mật khẩu đã lưu khi token hết hạn."""
import time
from typing import Any

from .backend import ApiError, Backend
from .crypto import decrypt
from .store import Link, Store

EXPIRY_MARGIN_S = 60
LOGIN_DEAD = {"INVALID_CREDENTIALS", "ACCOUNT_LOCKED"}


class NeedsLogin(Exception):
    """Mật khẩu đã lưu không còn dùng được (đổi mật khẩu trên web hoặc bị khoá)."""


class Sessions:
    def __init__(self, backend: Backend, store: Store, secret_key: str):
        self.backend = backend
        self.store = store
        self.secret_key = secret_key
        self._tokens: dict[int, tuple[str, float]] = {}

    async def _login(self, link: Link) -> str:
        try:
            result = await self.backend.login(link.username, decrypt(self.secret_key, link.password_enc))
        except ApiError as error:
            if error.code in LOGIN_DEAD:
                self._tokens.pop(link.chat_id, None)
                self.store.set_link_status(link.chat_id, "needs_login")
                raise NeedsLogin(error.message) from error
            raise
        token = result["accessToken"]
        self._tokens[link.chat_id] = (token, time.time() + result["expiresIn"] - EXPIRY_MARGIN_S)
        return token

    async def _token(self, link: Link) -> str:
        cached = self._tokens.get(link.chat_id)
        if cached and cached[1] > time.time():
            return cached[0]
        return await self._login(link)

    async def call(self, link: Link, method: str, path: str, json: Any = None,
                   headers: dict[str, str] | None = None) -> Any:
        token = await self._token(link)
        try:
            return await self.backend.request(method, path, token, json, headers)
        except ApiError as error:
            if error.status != 401:
                raise
        token = await self._login(link)
        return await self.backend.request(method, path, token, json, headers)

    def forget(self, chat_id: int) -> None:
        self._tokens.pop(chat_id, None)
