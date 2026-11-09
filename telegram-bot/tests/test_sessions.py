import asyncio
import json

import httpx
import pytest
from cryptography.fernet import Fernet

from bot.backend import Backend
from bot.crypto import encrypt
from bot.sessions import NeedsLogin, Sessions
from bot.store import Link, Store

KEY = Fernet.generate_key().decode()
USER = {"id": "1002", "username": "thue101", "displayName": "Người thuê", "role": "tenant",
        "scope": {"boardingHouseIds": [], "roomIds": ["101"]}, "locked": False,
        "createdAt": "2026-11-06T00:00:00+00:00", "permissions": ["incidents:acknowledge"]}


def setup(tmp_path, handler):
    store = Store(str(tmp_path / "bot.db"))
    link = Link(1, "thue101", encrypt(KEY, "dung-mat-khau"), "1002", "Người thuê", "tenant", "active")
    store.save_link(link)
    client = httpx.AsyncClient(transport=httpx.MockTransport(handler), base_url="http://be")
    return store, link, Sessions(Backend("http://be", client), store, KEY)


def login_ok(n):
    return httpx.Response(200, json={"accessToken": f"tok{n}", "tokenType": "Bearer",
                                     "expiresIn": 1800, "user": USER})


def test_dung_lai_token_giua_hai_lan_goi(tmp_path):
    logins = []

    def handler(req: httpx.Request):
        if req.url.path == "/api/auth/login":
            logins.append(json.loads(req.content))
            return login_ok(len(logins))
        assert req.headers["Authorization"] == "Bearer tok1"
        return httpx.Response(200, json=[])

    store, link, sessions = setup(tmp_path, handler)
    asyncio.run(sessions.call(link, "GET", "/api/incidents/active"))
    asyncio.run(sessions.call(link, "GET", "/api/incidents/active"))
    assert len(logins) == 1
    assert logins[0] == {"username": "thue101", "password": "dung-mat-khau"}


def test_401_thi_dang_nhap_lai_roi_goi_lai(tmp_path):
    logins = []

    def handler(req: httpx.Request):
        if req.url.path == "/api/auth/login":
            logins.append(1)
            return login_ok(len(logins))
        if req.headers["Authorization"] == "Bearer tok1":
            return httpx.Response(401, json={"code": "UNAUTHENTICATED", "message": "Hết hạn"})
        return httpx.Response(200, json=[{"id": "42"}])

    store, link, sessions = setup(tmp_path, handler)
    assert asyncio.run(sessions.call(link, "GET", "/api/incidents/active")) == [{"id": "42"}]
    assert len(logins) == 2


def test_doi_mat_khau_tren_web_thi_can_dang_nhap_lai(tmp_path):
    def handler(req: httpx.Request):
        return httpx.Response(401, json={"code": "INVALID_CREDENTIALS", "message": "Sai"})

    store, link, sessions = setup(tmp_path, handler)
    with pytest.raises(NeedsLogin):
        asyncio.run(sessions.call(link, "GET", "/api/rooms/status"))
    assert store.get_link(1).status == "needs_login"
