import json
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

from app.api.routes.rooms import router
from app.core.dependencies import get_current_user
from app.db.session import Base, get_db
from app.models.boarding_house import BoardingHouse
from app.models.incident import Incident
from app.models.measurement import Measurement
from app.models.node import Node
from app.models.room import Room
from app.models.user import User
from app.models.user_scope import UserScope


def test_room_routes_include_all_nodes_with_their_own_readings_and_scope():
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    models = [User, BoardingHouse, Room, UserScope, Node, Measurement, Incident]
    Base.metadata.create_all(engine, tables=[model.__table__ for model in models])
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    payload = json.dumps({"mq2": {"health": "ok"}, "temperature": {"health": "ok"}})

    try:
        with Session(engine) as db:
            db.add_all([
                User(id=1, username="owner", password_hash="test", _role="owner"),
                User(id=2, username="tenant", password_hash="test", _role="tenant"),
                BoardingHouse(id=1, name="House", landlord_id=1),
                Room(id="101", name="101", boarding_house_id=1),
                Room(id="102", name="102", boarding_house_id=1),
                UserScope(user_id=2, room_id="101", started_at=now - timedelta(days=1)),
                Node(id="node11", code="First", room_id="101", _lifecycle="active", last_seen_at=now),
                Node(id="node12", code="Second", room_id="101", _lifecycle="active"),
                Node(id="node13", code="Blocked", room_id="101", _lifecycle="blocked"),
                Node(id="node21", code="Other room", room_id="102", _lifecycle="active"),
                Measurement(id=1, node_id="node11", room_id="101", measured_at=now, gas_value=171, raw_payload=payload),
                Measurement(id=2, node_id="node11", room_id="101", measured_at=now, gas_value=172, raw_payload=payload),
                Measurement(id=3, node_id="node12", room_id="101", measured_at=now, gas_value=284, raw_payload=payload),
                Measurement(id=4, node_id="node12", room_id="102", measured_at=now + timedelta(seconds=1),
                            gas_value=999, raw_payload=payload),
                Incident(id=1, device_id="node12", room_id="101", alert_type="flame",
                         _status="open", signs={"signs": ["flame"]}, started_at=now),
            ])
            db.commit()

        def test_db():
            with Session(engine) as db:
                yield db

        app = FastAPI()
        app.include_router(router)
        app.dependency_overrides[get_db] = test_db
        app.dependency_overrides[get_current_user] = lambda: User(id=2, _role="tenant")
        with TestClient(app) as client:
            response = client.get("/api/rooms")
            assert response.status_code == 200
            assert [room["id"] for room in response.json()] == ["101"]
            assert response.json()[0]["activeNodeIds"] == ["node11", "node12"]

            response = client.get("/api/rooms/status")
            assert response.status_code == 200
            room, = response.json()
            assert room["room"]["id"] == "101"
            assert room["node"]["id"] == "node11"
            assert room["activeIncidentId"] == "1"
            assert room["hazardSigns"] == ["flame"]
            first, second, blocked = room["nodes"]
            assert [(node["id"], node["sensors"][0]["value"]) for node in (first, second)] == [
                ("node11", 172), ("node12", 284),
            ]
            assert [node["connectivity"] for node in (first, second)] == ["online", "offline"]
            assert (blocked["id"], blocked["lifecycle"], blocked["sensors"]) == ("node13", "blocked", [])

            response = client.get("/api/rooms/101")
            assert response.status_code == 200
            first, second, blocked = response.json()["nodes"]
            assert first["latest_measurement"]["gas_value"] == 172
            assert second["latest_measurement"]["gas_value"] == 284
            assert blocked["latest_measurement"] is None
    finally:
        engine.dispose()
