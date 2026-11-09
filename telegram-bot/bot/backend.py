"""Gọi API backend FastAPI. Không log token hay mật khẩu."""
from typing import Any

import httpx


class ApiError(Exception):
    def __init__(self, status: int, code: str, message: str):
        super().__init__(message)
        self.status = status
        self.code = code
        self.message = message


def _error(response: httpx.Response) -> ApiError:
    try:
        body = response.json()
    except ValueError:
        body = {}
    if isinstance(body, dict) and isinstance(body.get("code"), str):
        return ApiError(response.status_code, body["code"], str(body.get("message", "")))
    detail = body.get("detail") if isinstance(body, dict) else None
    return ApiError(response.status_code, f"HTTP_{response.status_code}",
                    detail if isinstance(detail, str) else "Có lỗi xảy ra.")


class Backend:
    def __init__(self, base_url: str, client: httpx.AsyncClient | None = None):
        self.base_url = base_url.rstrip("/")
        self.client = client or httpx.AsyncClient(timeout=10)

    async def login(self, username: str, password: str) -> dict:
        response = await self.client.post(
            f"{self.base_url}/api/auth/login", json={"username": username, "password": password})
        if response.status_code != 200:
            raise _error(response)
        return response.json()

    async def request(self, method: str, path: str, token: str) -> Any:
        response = await self.client.request(
            method, f"{self.base_url}{path}", headers={"Authorization": f"Bearer {token}"})
        if response.status_code >= 400:
            raise _error(response)
        return None if response.status_code == 204 else response.json()
