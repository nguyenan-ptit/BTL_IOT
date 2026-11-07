
from datetime import datetime

from fastapi import APIRouter, Depends
from fastapi import HTTPException
from app.core.access import can_access_room
from sqlalchemy.orm import Session
from sqlalchemy import select

from app.db.session import get_db
from app.models.room import Room
from app.models.node import Node
from app.models.measurement import Measurement
from app.core.dependencies import get_current_user
from app.models.user import User
from app.models.user_scope import UserScope

router = APIRouter(prefix="/api/rooms", tags=["Rooms"])




@router.get("")
def get_rooms(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    # Admin được xem toàn bộ phòng
    if current_user.role == "admin":
        rooms = (
            db.query(Room)
            .order_by(Room.id)
            .all()
        )
    else:
        # Lấy các scope đã được cấp cho người dùng
        scopes = (
            db.query(UserScope)
            .filter(UserScope.user_id == current_user.id)
            .all()
        )

        allowed_room_ids = {
            scope.room_id
            for scope in scopes
            if scope.room_id is not None
        }

        allowed_house_ids = {
            scope.boarding_house_id
            for scope in scopes
            if scope.boarding_house_id is not None
        }

        # Chỉ trả về phòng được cấp trực tiếp hoặc thuộc nhà trọ được cấp
        rooms = (
            db.query(Room)
            .filter(
                (Room.id.in_(allowed_room_ids))
                | (Room.boarding_house_id.in_(allowed_house_ids))
            )
            .order_by(Room.id)
            .all()
        ) if allowed_room_ids or allowed_house_ids else []

    result = []

    for room in rooms:
        nodes = (
            db.query(Node)
            .filter(Node.room_id == room.id)
            .all()
        )

        node_results = []

        for node in nodes:
            latest = (
                db.query(Measurement)
                .filter(Measurement.node_id == node.id)
                .order_by(Measurement.measured_at.desc())
                .first()
            )

            node_results.append({
                "node_id": node.id,
                "node_code": node.code,
                "lifecycle": node.lifecycle,
                "connectivity": node.connectivity,
                "last_seen_at": (
                    node.last_seen_at.isoformat()
                    if node.last_seen_at else None
                ),
                "latest_measurement": (
                    {
                        "measured_at": latest.measured_at.isoformat(),
                        "gas_value": latest.gas_value,
                        "gas_health": latest.gas_health,
                        "temperature_value": latest.temperature_value,
                        "temperature_health": latest.temperature_health,
                        "flame_detected": latest.flame_detected,
                        "flame_health": latest.flame_health,
                    }
                    if latest else None
                ),
            })

        result.append({
            "room_id": room.id,
            "room_name": room.name,
            "boarding_house_id": room.boarding_house_id,
            "nodes": node_results,
        })

    return {
        "total": len(result),
        "rooms": result,
    }


@router.get("/{room_id}")
def get_room_detail(
    room_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    room = (
        db.query(Room)
        .filter(Room.id == room_id)
        .first()
    )

    if room is None:
        raise HTTPException(
            status_code=404,
            detail="Không tìm thấy phòng",
        )

    if not can_access_room(room_id, current_user, db):
        raise HTTPException(
            status_code=403,
            detail="Bạn không có quyền truy cập phòng này",
        )

    nodes = (
        db.query(Node)
        .filter(Node.room_id == room_id)
        .all()
    )

    node_results = []

    for node in nodes:
        latest = (
            db.query(Measurement)
            .filter(Measurement.node_id == node.id)
            .order_by(Measurement.measured_at.desc())
            .first()
        )

        node_results.append({
            "node_id": node.id,
            "node_code": node.code,
            "lifecycle": node.lifecycle,
            "connectivity": node.connectivity,
            "last_seen_at": (
                node.last_seen_at.isoformat()
                if node.last_seen_at else None
            ),
            "latest_measurement": (
                {
                    "measured_at": latest.measured_at.isoformat(),
                    "gas_value": latest.gas_value,
                    "gas_health": latest.gas_health,
                    "temperature_value": latest.temperature_value,
                    "temperature_health": latest.temperature_health,
                    "flame_detected": latest.flame_detected,
                    "flame_health": latest.flame_health,
                }
                if latest else None
            ),
        })

    return {
        "room_id": room.id,
        "room_name": room.name,
        "boarding_house_id": room.boarding_house_id,
        "nodes": node_results,
    }
