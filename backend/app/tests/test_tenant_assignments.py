import os
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
os.environ.setdefault("IOT_MYSQL_PASSWORD", "test-only-password")
os.environ.setdefault("JWT_SECRET", "test-only-secret-0123456789abcdef")

from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app.api.routes.accounts import router as accounts_router
from app.api.routes.rooms import router as rooms_router
from app.core.security import create_access_token
from app.db.session import Base, get_db
from app.models.audit_log import AuditLog
from app.models.boarding_house import BoardingHouse
from app.models.node import Node
from app.models.room import Room
from app.models.user import User
from app.models.user_scope import UserScope


def test_landlord_lists_moves_and_ends_only_own_active_assignments():
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    tables = (User, BoardingHouse, Room, UserScope, Node)
    Base.metadata.create_all(engine, tables=[model.__table__ for model in tables])
    # SQLite auto-generates IDs only for its exact INTEGER PRIMARY KEY type.
    with engine.begin() as conn:
        conn.exec_driver_sql(
            "CREATE TABLE audit_logs (log_id INTEGER PRIMARY KEY, actor_user_id INTEGER, room_id TEXT,"
            " action TEXT, target_type TEXT, target_id TEXT, result TEXT, details JSON, created_at DATETIME)"
        )
    now = datetime.now(timezone.utc).replace(tzinfo=None, microsecond=0)
    earlier = now - timedelta(days=2)
    landlord = {"Authorization": f"Bearer {create_access_token(1, 'owner', 'owner')}"}
    tenant = {"Authorization": f"Bearer {create_access_token(3, 'tenant', 'tenant')}"}
    base = "/api/accounts/tenants"

    try:
        with Session(engine) as db:
            db.add_all([
                User(id=1, username="owner", _role="owner", password_hash="private", created_at=earlier),
                User(id=2, username="other-owner", _role="owner", password_hash="private", created_at=earlier),
                User(id=3, username="tenant", _role="tenant", password_hash="private", created_at=earlier),
                BoardingHouse(id=1, name="Own", landlord_id=1),
                BoardingHouse(id=2, name="Other", landlord_id=2),
                Room(id="A", name="101", boarding_house_id=1),
                Room(id="B", name="102", boarding_house_id=1),
                Room(id="C", name="201", boarding_house_id=2),
                UserScope(id=1, user_id=3, room_id="A", started_at=earlier),
                UserScope(id=2, user_id=3, room_id="A", started_at=earlier),
                UserScope(id=3, user_id=3, room_id="C", started_at=earlier),
                UserScope(id=4, user_id=3, room_id="B", started_at=earlier, ended_at=now - timedelta(days=1)),
                UserScope(id=5, user_id=3, room_id="B", started_at=now + timedelta(days=1)),
            ])
            db.commit()

        def db_session():
            with Session(engine) as db:
                yield db

        app = FastAPI()
        app.include_router(accounts_router)
        app.include_router(rooms_router)
        app.dependency_overrides[get_db] = db_session

        with TestClient(app) as client:
            response = client.get(base, headers=landlord)
            assert response.status_code == 200
            assert response.json() == {"items": [{
                "assignment_id": 1, "username": "tenant", "display_name": None,
                "room_id": "A", "room_name": "101", "house_name": "Own",
            }]}
            assert client.get(base, headers=tenant).status_code == 403
            assert client.patch(f"{base}/assignments/1", headers=tenant, json={"room_id": None}).status_code == 403
            for unowned_or_inactive in (3, 4, 5):
                assert client.patch(f"{base}/assignments/{unowned_or_inactive}", headers=landlord,
                                    json={"room_id": None}).status_code == 404
            assert client.patch(f"{base}/assignments/1", headers=landlord, json={"room_id": "C"}).status_code == 403
            assert client.patch(f"{base}/assignments/1", headers=landlord, json={}).status_code == 422

            assert client.patch(f"{base}/assignments/1", headers=landlord, json={"room_id": "B"}).status_code == 200
            assert {room["id"] for room in client.get("/api/rooms", headers=tenant).json()} == {"B", "C"}
            assert client.patch(f"{base}/assignments/1", headers=landlord, json={"room_id": None}).status_code == 404

            item, = client.get(base, headers=landlord).json()["items"]
            assert item["room_id"] == "B"
            response = client.patch(f"{base}/assignments/{item['assignment_id']}", headers=landlord, json={"room_id": None})
            assert response.status_code == 200
            assert client.get(base, headers=landlord).json() == {"items": []}
            assert [room["id"] for room in client.get("/api/rooms", headers=tenant).json()] == ["C"]

        with Session(engine) as db:
            assert db.get(User, 3).status == "active"
            assert db.get(UserScope, 1).ended_at == db.get(UserScope, 2).ended_at
            assert db.get(UserScope, 3).ended_at is None
            assert [log.summary for log in db.query(AuditLog).order_by(AuditLog.id)] == [
                "Chuyển phòng A sang B", "Kết thúc thuê phòng B",
            ]
    finally:
        engine.dispose()
