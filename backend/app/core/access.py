
from fastapi import Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.dependencies import get_current_user
from app.db.session import get_db
from app.models.user import User
from app.models.user_scope import UserScope
from app.models.room import Room


def can_access_room(
    room_id: int,
    user: User,
    db: Session,
) -> bool:
    # Admin được phép truy cập mọi phòng theo chính sách hiện tại
    if user.role == "admin":
        return True

    # Phòng phải tồn tại
    room = db.query(Room).filter(Room.id == room_id).first()

    if room is None:
        return False

    scopes = (
        db.query(UserScope)
        .filter(UserScope.user_id == user.id)
        .all()
    )

    for scope in scopes:
        # Scope cấp trực tiếp cho phòng
        if scope.room_id == room_id:
            return True

        # Scope cấp cho toàn bộ nhà trọ chứa phòng
        if (
            scope.boarding_house_id is not None
            and scope.boarding_house_id == room.boarding_house_id
        ):
            return True

    return False


def require_room_access(
    room_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> User:
    if not can_access_room(room_id, user, db):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Bạn không có quyền truy cập phòng này",
        )

    return user
