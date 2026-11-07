from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.models.boarding_house import BoardingHouse
from app.models.room import Room
from app.models.user import User
from app.models.user_scope import UserScope


def can_access_room(room_id: str, user: User, db: Session, *, audit_denied: bool = False) -> bool:
    if user.role == "admin":
        return db.query(Room.id).filter(Room.id == str(room_id)).first() is not None

    room = db.query(Room).filter(Room.id == str(room_id)).first()
    if room is None:
        return False
    if user.role == "landlord":
        return db.query(BoardingHouse.id).filter(
            BoardingHouse.id == room.boarding_house_id,
            BoardingHouse.landlord_id == user.id,
        ).first() is not None
    if user.role == "tenant":
        now = datetime.now(timezone.utc).replace(tzinfo=None)
        return db.query(UserScope.id).filter(
            UserScope.room_id == str(room_id),
            UserScope.user_id == user.id,
            UserScope.started_at <= now,
            (UserScope.ended_at.is_(None)) | (UserScope.ended_at > now),
        ).first() is not None
    if audit_denied:
        try:
            from app.core.audit import write_audit
            write_audit(db, actor_id=user.id, action="authorization_denied", target_type="room",
                        target_id=room_id, summary="Bị từ chối truy cập phòng", result="denied")
            db.commit()
        except Exception:
            db.rollback()
    return False


def require_room_access(room_id: str, user: User, db: Session) -> User:
    from fastapi import HTTPException

    if not can_access_room(room_id, user, db):
        raise HTTPException(403, {"code": "FORBIDDEN", "message": "Bạn không có quyền truy cập phòng này."})
    return user
