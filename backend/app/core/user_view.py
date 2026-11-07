from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.models.boarding_house import BoardingHouse
from app.models.room import Room
from app.models.user import User
from app.models.user_scope import UserScope


ROLE_PERMISSIONS = {
    "admin": ["nodes:manage", "users:manage", "audit:read", "thresholds:manage"],
    "landlord": ["incidents:acknowledge", "thresholds:manage"],
    "tenant": ["incidents:acknowledge"],
}


def active_room_ids(db: Session, user_id: int) -> list[str]:
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    rows = (
        db.query(UserScope.room_id)
        .filter(UserScope.user_id == user_id, UserScope.started_at <= now)
        .filter((UserScope.ended_at.is_(None)) | (UserScope.ended_at > now))
        .order_by(UserScope.room_id)
        .all()
    )
    return [row[0] for row in rows]


def user_scope(db: Session, user: User) -> dict:
    if user.role == "admin":
        return {
            "boardingHouseIds": [str(row[0]) for row in db.query(BoardingHouse.id).order_by(BoardingHouse.id).all()],
            "roomIds": [str(row[0]) for row in db.query(Room.id).order_by(Room.id).all()],
        }
    houses = []
    if user.role == "landlord":
        houses = [str(row[0]) for row in db.query(BoardingHouse.id).filter(
            BoardingHouse.landlord_id == user.id).order_by(BoardingHouse.id).all()]
    return {"boardingHouseIds": houses, "roomIds": active_room_ids(db, user.id)}


def public_user(db: Session, user: User, *, current: bool = False) -> dict:
    created_at = user.created_at or datetime(1970, 1, 1)
    if created_at.tzinfo is None:
        created_at = created_at.replace(tzinfo=timezone.utc)
    result = {
        "id": str(user.id),
        "username": user.username,
        "displayName": user.display_name or "",
        "role": user.role,
        "scope": user_scope(db, user),
        "locked": user.is_locked,
        "createdAt": created_at.isoformat(),
    }
    if current:
        result["permissions"] = ROLE_PERMISSIONS.get(user.role, [])
    return result
