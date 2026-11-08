import os
import sys
from datetime import datetime
from pathlib import Path

import pytest

BACKEND_DIR = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(BACKEND_DIR))
os.environ.setdefault("IOT_MYSQL_PASSWORD", "test-only-password")
if len(os.environ.get("JWT_SECRET", "")) < 32:
    os.environ["JWT_SECRET"] = "test-only-secret-0123456789abcdef"

from fastapi import HTTPException

from app.api.routes import incidents as incident_routes
from app.models.incident import Incident
from app.models.user import User


class _Query:
    def __init__(self, row):
        self.row = row

    def filter(self, *_args):
        return self

    def with_for_update(self):
        return self

    def first(self):
        return self.row


class _DB:
    def __init__(self, incident=None):
        self.incident = incident
        self.added = []

    def query(self, _model):
        return _Query(self.incident)

    def add(self, row):
        self.added.append(row)

    def commit(self):
        pass

    def refresh(self, _row):
        pass


def _user(role, user_id=12):
    return User(id=user_id, username="test-user", password_hash="unused", display_name="Test",
                role=role, status="active", created_at=datetime(2026, 1, 1))


def _incident(status):
    return Incident(id=42, device_id="node-1", room_id="101", alert_type="gas",
                    _status=status, started_at=datetime(2026, 1, 1))


def test_admin_cannot_acknowledge_or_close_incidents():
    admin = _user("admin")
    db = _DB()
    for handler in (incident_routes.acknowledge_incident, incident_routes.resolve_incident):
        with pytest.raises(HTTPException) as error:
            handler(42, admin, db)
        assert error.value.status_code == 403


def test_tenant_cannot_close_before_sensor_recovery(monkeypatch):
    incident = _incident("handling")
    monkeypatch.setattr(incident_routes, "_can_view_incident", lambda *_args, **_kwargs: True)
    with pytest.raises(HTTPException) as error:
        incident_routes.resolve_incident(42, _user("tenant"), _DB(incident))
    assert error.value.status_code == 409
    assert error.value.detail["code"] == "INCIDENT_NOT_RECOVERED"
    assert incident._status == "handling"


@pytest.mark.parametrize("role", ["tenant", "landlord"])
def test_tenant_and_landlord_can_close_recovered_incident(role, monkeypatch):
    incident = _incident("recovered")
    db = _DB(incident)
    user = _user(role)
    monkeypatch.setattr(incident_routes, "_can_view_incident", lambda *_args, **_kwargs: True)

    response = incident_routes.resolve_incident(42, user, db)

    assert incident._status == "closed"
    assert incident.closed_by == user.id
    assert incident.closed_at is not None
    assert response["status"] == "resolved"
    assert len(db.added) == 1  # Audit event only; no extra event table is needed.
