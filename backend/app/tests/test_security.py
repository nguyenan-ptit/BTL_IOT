import os
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest

BACKEND_DIR = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(BACKEND_DIR))
os.environ.setdefault("IOT_MYSQL_PASSWORD", "test-only-password")
if len(os.environ.get("JWT_SECRET", "")) < 32:
    os.environ["JWT_SECRET"] = "test-only-secret-0123456789abcdef"

from fastapi import HTTPException
from fastapi.security import HTTPAuthorizationCredentials
from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool
from starlette.requests import Request

import jwt
from app.core.access import can_access_room
from app.core.config import settings
from app.core.dependencies import get_current_user
from app.core.security import ALGORITHM, hash_password, verify_password
from app.core.user_view import public_user
from app.api.routes.accounts import _require_admin
from app.db.session import Base
from app.models.boarding_house import BoardingHouse
from app.models.room import Room
from app.models.user import User
from app.models.user_scope import UserScope


def _request(cookie: str | None = None):
    headers = [] if cookie is None else [(b"cookie", f"btl_access={cookie}".encode())]
    return Request({"type": "http", "method": "GET", "path": "/", "headers": headers})


class _Query:
    def __init__(self, user):
        self.user = user

    def filter(self, *_args):
        return self

    def first(self):
        return self.user


class _UserDB:
    def __init__(self, user):
        self.user = user

    def query(self, _model):
        return _Query(self.user)


def _token(user_id=7, *, exp=None, algorithm=ALGORITHM):
    now = datetime.now(timezone.utc)
    return jwt.encode({
        "sub": str(user_id), "user_id": user_id, "username": "tenant",
        "role": "tenant", "iat": now,
        "exp": exp or now + timedelta(minutes=5),
    }, settings.jwt_secret_key if algorithm == ALGORITHM else "x" * 64, algorithm=algorithm)


def test_passwords_are_argon2_hashes_and_verify():
    encoded = hash_password("correct horse battery")
    assert encoded != "correct horse battery"
    assert encoded.startswith("$argon2")
    assert verify_password("correct horse battery", encoded)
    assert not verify_password("wrong password", encoded)


@pytest.mark.parametrize("token", [None, "not-a-jwt"])
def test_missing_or_invalid_token_is_401(token):
    credentials = None if token is None else HTTPAuthorizationCredentials(scheme="Bearer", credentials=token)
    with pytest.raises(HTTPException) as error:
        get_current_user(_request(), credentials, _UserDB(None))
    assert error.value.status_code == 401


def test_expired_token_is_401():
    expired = _token(exp=datetime.now(timezone.utc) - timedelta(seconds=5))
    with pytest.raises(HTTPException) as error:
        get_current_user(_request(expired), None, _UserDB(None))
    assert error.value.status_code == 401


def test_wrong_jwt_algorithm_is_rejected():
    token = _token(algorithm="HS512")
    with pytest.raises(HTTPException) as error:
        get_current_user(_request(token), None, _UserDB(None))
    assert error.value.status_code == 401


def test_locked_account_cannot_use_valid_token():
    user = User(id=7, username="tenant", password_hash="not-returned", display_name="Tenant",
                role="tenant", status="locked", created_at=datetime.now())
    with pytest.raises(HTTPException) as error:
        get_current_user(_request(_token()), None, _UserDB(user))
    assert error.value.status_code == 401


@pytest.mark.parametrize("role", ["tenant", "landlord"])
def test_non_admin_cannot_manage_accounts_or_assign_roles(role):
    class AuditDB:
        def add(self, _row):
            pass

        def commit(self):
            pass

    user = User(id=9, username="caller", password_hash="x", display_name="Caller",
                role=role, status="active", created_at=datetime.now())
    with pytest.raises(HTTPException) as error:
        _require_admin(user, AuditDB())
    assert error.value.status_code == 403


def test_public_user_never_contains_password_hash():
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine, tables=[User.__table__, BoardingHouse.__table__, Room.__table__, UserScope.__table__])
    with Session(engine) as db:
        user = User(id=1, username="tenant", password_hash="secret-hash", display_name="Tenant",
                    role="tenant", status="active", created_at=datetime.now())
        db.add(user)
        db.flush()
        public = public_user(db, user, current=True)
        assert "password_hash" not in public
        assert "secret-hash" not in repr(public)
    engine.dispose()


def test_room_access_enforces_landlord_and_active_tenant_scope():
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine, tables=[User.__table__, BoardingHouse.__table__, Room.__table__, UserScope.__table__])
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    with Session(engine) as db:
        landlord_a = User(username="landlord-a", password_hash="x", display_name="A", role="landlord", status="active", created_at=now)
        landlord_b = User(username="landlord-b", password_hash="x", display_name="B", role="landlord", status="active", created_at=now)
        tenant = User(username="tenant", password_hash="x", display_name="T", role="tenant", status="active", created_at=now)
        db.add_all([landlord_a, landlord_b, tenant])
        db.flush()
        house_a = BoardingHouse(name="A", landlord_id=landlord_a.id)
        house_b = BoardingHouse(name="B", landlord_id=landlord_b.id)
        db.add_all([house_a, house_b])
        db.flush()
        room_a = Room(id="101", name="101", boarding_house_id=house_a.id)
        room_b = Room(id="201", name="201", boarding_house_id=house_b.id)
        db.add_all([room_a, room_b])
        db.flush()
        db.add(UserScope(user_id=tenant.id, room_id=room_a.id, started_at=now - timedelta(days=1)))
        db.commit()

        assert can_access_room("101", landlord_a, db)
        assert not can_access_room("201", landlord_a, db)
        assert can_access_room("101", tenant, db)
        assert not can_access_room("201", tenant, db)

        old_link = db.query(UserScope).filter_by(user_id=tenant.id).first()
        old_link.ended_at = now - timedelta(seconds=1)
        db.commit()
        assert not can_access_room("101", tenant, db)
    engine.dispose()
