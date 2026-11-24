from collections import defaultdict
from datetime import datetime, timezone
import json

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Query as ORMQuery, Session, aliased

from app.core.access import can_access_room
from app.core.dependencies import get_current_user
from app.db.session import get_db
from app.core.audit import write_audit
from app.models.boarding_house import BoardingHouse
from app.models.incident import Incident
from app.models.measurement import Measurement
from app.models.node import Node
from app.models.room import Room
from app.models.user import User
from app.models.user_scope import UserScope
from app.schemas.rooms import BoardingHouseCreateRequest, RoomCreateRequest


router = APIRouter(prefix="/api/rooms", tags=["Rooms"])
houses_router = APIRouter(prefix="/api/boarding-houses", tags=["Rooms"])
HAZARDS = {"gas", "high_temperature", "flame"}
MONITORING_LIFECYCLES = ("active", "maintenance")


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


def _public_room(room: Room, active_node_ids: list[str] | None = None):
    active_node_ids = active_node_ids or []
    return {
        "id": str(room.id),
        "boardingHouseId": str(room.boarding_house_id),
        "name": room.name,
        "activeNodeId": active_node_ids[0] if active_node_ids else None,
        "activeNodeIds": active_node_ids,
    }


def _latest_node_measurements(db: Session, nodes: ORMQuery):
    latest = aliased(Measurement)
    latest_id = db.query(latest.id).filter(
        latest.node_id == Node.id,
        latest.room_id == Node.room_id,
    ).order_by(latest.measured_at.desc(), latest.id.desc()).limit(1).correlate(Node).scalar_subquery()
    return nodes.add_entity(Measurement).outerjoin(Measurement, Measurement.id == latest_id).all()


def _sensors(measurement: Measurement | None):
    payload = _payload(measurement)
    flame_data = payload.get("flame") if isinstance(payload.get("flame"), dict) else {}
    gas_health = _health(payload, "mq2", "fault")
    temperature_health = _health(payload, "temperature", "fault")
    flame_health = _health(payload, "flame", "fault")
    return [
        {"kind": "gas", "health": gas_health,
         "value": measurement.gas_value if measurement and gas_health == "ok" else None},
        {"kind": "temperature", "health": temperature_health,
         "value": measurement.temperature_value if measurement and temperature_health == "ok" else None},
        {"kind": "flame", "health": flame_health,
         "value": flame_data.get("alarm") if flame_health == "ok" and type(flame_data.get("alarm")) is bool else None},
    ]


def _node_summary(node: Node):
    return {"id": str(node.id), "code": node.code, "lifecycle": node.lifecycle,
            "connectivity": node.connectivity, "lastSeenAt": _iso(node.last_seen_at)}


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
    ids_by_room = defaultdict(list)
    for room_id, node_id in db.query(Node.room_id, Node.id).filter(
        Node.room_id.in_([room.id for room in rooms]),
        Node._lifecycle.in_(MONITORING_LIFECYCLES),
    ).order_by(Node.id):
        ids_by_room[room_id].append(str(node_id))
    return [_public_room(room, ids_by_room[room.id]) for room in rooms]


@router.post("", status_code=status.HTTP_201_CREATED)
def create_room(
    payload: RoomCreateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    house = db.query(BoardingHouse).filter(BoardingHouse.id == payload.boardingHouseId).first()
    if house is None:
        raise HTTPException(404, {"code": "NOT_FOUND", "message": "Không tìm thấy nhà trọ."})
    if current_user.role != "admin" and not (
        current_user.role == "landlord" and house.landlord_id == current_user.id
    ):
        raise HTTPException(403, {"code": "FORBIDDEN", "message": "Bạn không có quyền quản lý nhà trọ này."})
    room_id = payload.id.strip()
    if db.query(Room).filter(Room.id == room_id).first():
        raise HTTPException(409, {"code": "ROOM_ID_TAKEN", "message": "Mã phòng đã tồn tại."})
    room = Room(id=room_id, boarding_house_id=house.id, name=payload.name.strip())
    try:
        db.add(room)
        db.flush()
        write_audit(db, actor_id=current_user.id, action="room_created", target_type="room",
                    target_id=room.id, summary=f"Tạo phòng {room.name} tại nhà {house.name}", room_id=room.id)
        db.commit()
        return _public_room(room)
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(409, {"code": "ROOM_ID_TAKEN", "message": "Mã phòng đã tồn tại."}) from exc
    except Exception:
        db.rollback()
        raise


@router.get("/status")
def get_room_statuses(
    boardingHouseId: str | None = Query(default=None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    query = _room_query(db, current_user)
    if boardingHouseId:
        query = query.filter(Room.boarding_house_id == boardingHouseId)
    rooms = query.order_by(Room.id).all()
    nodes_by_room = defaultdict(list)
    nodes = db.query(Node).filter(
        Node.room_id.in_([room.id for room in rooms]),
        Node._lifecycle != "decommissioned",
    ).order_by(Node.id)
    for node, measurement in _latest_node_measurements(db, nodes):
        summary = _node_summary(node)
        if node._lifecycle == "blocked":
            summary["lifecycle"] = "blocked"
        monitoring = node._lifecycle in MONITORING_LIFECYCLES
        nodes_by_room[node.room_id].append({**summary, "sensors": _sensors(measurement) if monitoring else []})

    results = []
    for room in rooms:
        room_nodes = nodes_by_room[room.id]
        primary = next((node for node in room_nodes if node["lifecycle"] in MONITORING_LIFECYCLES), None)
        incident = db.query(Incident).filter(
            Incident.room_id == room.id,
            Incident._status.in_(("open", "handling")),
        ).order_by(Incident.started_at.desc(), Incident.id.desc()).first()
        signs = incident.signs if incident else None
        if isinstance(signs, dict):
            signs = signs.get("signs")
        signs = [sign for sign in signs if isinstance(sign, str) and sign in HAZARDS] if isinstance(signs, list) else []
        results.append({
            "room": {"id": str(room.id), "name": room.name, "boardingHouseId": str(room.boarding_house_id)},
            "nodes": room_nodes,
            "node": {key: value for key, value in primary.items() if key != "sensors"} if primary else None,
            "sensors": primary["sensors"] if primary else _sensors(None),
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


@houses_router.post("", status_code=status.HTTP_201_CREATED)
def create_boarding_house(
    payload: BoardingHouseCreateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if current_user.role == "landlord":
        landlord_id = current_user.id
        if payload.landlordId is not None and payload.landlordId != current_user.id:
            raise HTTPException(403, {"code": "FORBIDDEN", "message": "Không thể tạo nhà cho tài khoản khác."})
    elif current_user.role == "admin":
        landlord_id = payload.landlordId
        if landlord_id is None:
            raise HTTPException(422, {"code": "VALIDATION_ERROR", "message": "Cần chọn tài khoản landlord."})
        landlord = db.query(User).filter(User.id == landlord_id, User.role == "landlord").first()
        if landlord is None:
            raise HTTPException(422, {"code": "INVALID_LANDLORD", "message": "Tài khoản landlord không hợp lệ."})
    else:
        raise HTTPException(403, {"code": "FORBIDDEN", "message": "Bạn không có quyền thêm nhà trọ."})
    house = BoardingHouse(landlord_id=landlord_id, name=payload.name.strip(), address=payload.address or None)
    try:
        db.add(house)
        db.flush()
        write_audit(db, actor_id=current_user.id, action="boarding_house_created", target_type="house",
                    target_id=house.id, summary=f"Tạo nhà trọ {house.name}")
        db.commit()
        return {"id": str(house.id), "name": house.name, "landlordId": str(house.landlord_id),
                "address": house.address}
    except Exception:
        db.rollback()
        raise


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
    nodes = db.query(Node).filter(Node.room_id == room.id).order_by(Node.id)
    details = []
    for node, measurement in _latest_node_measurements(db, nodes):
        gas, temperature, flame = _sensors(measurement)
        details.append({
            "node_id": node.id, "node_code": node.code, "lifecycle": node.lifecycle,
            "connectivity": node.connectivity, "last_seen_at": _iso(node.last_seen_at),
            "latest_measurement": ({
                "measured_at": measurement.measured_at.isoformat(),
                "gas_value": gas["value"], "gas_health": gas["health"],
                "temperature_value": temperature["value"], "temperature_health": temperature["health"],
                "flame_detected": flame["value"], "flame_health": flame["health"],
            } if measurement else None),
        })
    return {
        "room_id": room.id,
        "room_name": room.name,
        "boarding_house_id": room.boarding_house_id,
        "nodes": details,
    }
