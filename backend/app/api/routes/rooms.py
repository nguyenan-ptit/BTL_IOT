from datetime import datetime, timezone
import json

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.core.access import can_access_room
from app.core.dependencies import get_current_user
from app.db.session import get_db
from app.models.boarding_house import BoardingHouse
from app.models.incident import Incident
from app.models.measurement import Measurement
from app.models.node import Node
from app.models.room import Room
from app.models.user import User
from app.models.user_scope import UserScope


router = APIRouter(prefix="/api/rooms", tags=["Rooms"])
houses_router = APIRouter(prefix="/api/boarding-houses", tags=["Rooms"])
HAZARDS = {"gas", "high_temperature", "flame"}


def _payload(measurement: Measurement | None) -> dict:
    if measurement is None or not measurement.raw_payload:
        return {}
    try:
        value = json.loads(measurement.raw_payload)
    except (TypeError, ValueError):
        return {}
    return value if isinstance(value, dict) else {}


def _health(payload: dict, key: str, fallback: str) -> str:
    sensor = payload.get(key)
    health = sensor.get("health") if isinstance(sensor, dict) else None
    return "ok" if health == "ok" else "fault" if health else fallback


def _iso(value):
    if value is None:
        return None
    return (value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value).isoformat()


def _room_query(db: Session, user: User):
    query = db.query(Room)
    if user.role == "admin":
        return query
    if user.role == "landlord":
        return query.join(BoardingHouse, Room.boarding_house_id == BoardingHouse.id).filter(
            BoardingHouse.landlord_id == user.id
        )
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    return query.join(UserScope, UserScope.room_id == Room.id).filter(
        UserScope.user_id == user.id,
        UserScope.started_at <= now,
        (UserScope.ended_at.is_(None)) | (UserScope.ended_at > now),
    ).distinct()


def _public_room(room: Room, active_node: Node | None = None):
    return {
        "id": str(room.id),
        "boardingHouseId": str(room.boarding_house_id),
        "name": room.name,
        "activeNodeId": str(active_node.id) if active_node else None,
    }


@router.get("")
def get_rooms(
    boardingHouseId: str | None = Query(default=None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    query = _room_query(db, current_user)
    if boardingHouseId:
        query = query.filter(Room.boarding_house_id == boardingHouseId)
    rooms = query.order_by(Room.id).all()
    result = []
    for room in rooms:
        node = db.query(Node).filter(
            Node.room_id == room.id,
            Node._lifecycle.in_(("active", "maintenance")),
        ).first()
        result.append(_public_room(room, node))
    return result


@router.get("/status")
def get_room_statuses(
    boardingHouseId: str | None = Query(default=None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    query = _room_query(db, current_user)
    if boardingHouseId:
        query = query.filter(Room.boarding_house_id == boardingHouseId)
    results = []
    for room in query.order_by(Room.id).all():
        node = db.query(Node).filter(
            Node.room_id == room.id,
            Node._lifecycle.in_(("active", "maintenance")),
        ).first()
        measurement = None
        if node:
            measurement = db.query(Measurement).filter(
                Measurement.node_id == node.id,
                Measurement.room_id == room.id,
            ).order_by(Measurement.measured_at.desc(), Measurement.id.desc()).first()
        payload = _payload(measurement)
        flame_data = payload.get("flame") if isinstance(payload.get("flame"), dict) else {}
        flame_health = _health(payload, "flame", "fault")
        sensors = [
            {"kind": "gas", "health": _health(payload, "mq2", "fault"),
             "value": measurement.gas_value if measurement and _health(payload, "mq2", "fault") == "ok" else None},
            {"kind": "temperature", "health": _health(payload, "temperature", "fault"),
             "value": measurement.temperature_value if measurement and _health(payload, "temperature", "fault") == "ok" else None},
            {"kind": "flame", "health": flame_health,
             "value": flame_data.get("alarm") if flame_health == "ok" and type(flame_data.get("alarm")) is bool else None},
        ]
        incident = db.query(Incident).filter(
            Incident.room_id == room.id,
            Incident._status.in_(("open", "handling")),
        ).order_by(Incident.started_at.desc()).first()
        signs = incident.signs if incident and isinstance(incident.signs, list) else []
        signs = [sign for sign in signs if sign in HAZARDS]
        results.append({
            "room": {"id": str(room.id), "name": room.name, "boardingHouseId": str(room.boarding_house_id)},
            "node": ({"id": str(node.id), "code": node.code, "lifecycle": node.lifecycle,
                      "connectivity": node.connectivity,
                      "lastSeenAt": _iso(node.last_seen_at)}
                     if node else None),
            "sensors": sensors,
            "activeIncidentId": str(incident.id) if incident else None,
            "hazardSigns": signs,
        })
    return results


@houses_router.get("")
def get_boarding_houses(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if current_user.role == "admin":
        houses = db.query(BoardingHouse).order_by(BoardingHouse.id).all()
    elif current_user.role == "landlord":
        houses = db.query(BoardingHouse).filter(
            BoardingHouse.landlord_id == current_user.id
        ).order_by(BoardingHouse.id).all()
    else:
        now = datetime.now(timezone.utc).replace(tzinfo=None)
        houses = db.query(BoardingHouse).join(Room, Room.boarding_house_id == BoardingHouse.id).join(
            UserScope, UserScope.room_id == Room.id
        ).filter(
            UserScope.user_id == current_user.id,
            UserScope.started_at <= now,
            (UserScope.ended_at.is_(None)) | (UserScope.ended_at > now),
        ).distinct().order_by(BoardingHouse.id).all()
    return [{"id": str(house.id), "name": house.name, "landlordId": str(house.landlord_id)} for house in houses]


@router.get("/{room_id}")
def get_room_detail(
    room_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    room = db.query(Room).filter(Room.id == room_id).first()
    if room is None:
        raise HTTPException(404, {"code": "NOT_FOUND", "message": "Không tìm thấy phòng."})
    if not can_access_room(room_id, current_user, db, audit_denied=True):
        raise HTTPException(403, {"code": "FORBIDDEN", "message": "Bạn không có quyền truy cập phòng này."})
    node = db.query(Node).filter(Node.room_id == room.id).first()
    measurement = db.query(Measurement).filter(
        Measurement.node_id == node.id, Measurement.room_id == room.id
    ).order_by(Measurement.measured_at.desc()).first() if node else None
    payload = _payload(measurement)
    flame_data = payload.get("flame") if isinstance(payload.get("flame"), dict) else {}
    flame_health = _health(payload, "flame", "fault")
    return {
        "room_id": room.id,
        "room_name": room.name,
        "boarding_house_id": room.boarding_house_id,
        "nodes": [] if node is None else [{
            "node_id": node.id, "node_code": node.code, "lifecycle": node.lifecycle,
            "connectivity": node.connectivity,
            "last_seen_at": _iso(node.last_seen_at),
            "latest_measurement": ({"measured_at": measurement.measured_at.isoformat(),
                                    "gas_value": measurement.gas_value if _health(payload, "mq2", "fault") == "ok" else None,
                                    "gas_health": _health(payload, "mq2", "fault"),
                                    "temperature_value": measurement.temperature_value if _health(payload, "temperature", "fault") == "ok" else None,
                                    "temperature_health": _health(payload, "temperature", "fault"),
                                    "flame_detected": flame_data.get("alarm") if flame_health == "ok" and type(flame_data.get("alarm")) is bool else None,
                                    "flame_health": flame_health} if measurement else None),
        }],
    }
