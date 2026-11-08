from datetime import datetime, timezone
import re

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.audit import write_audit
from app.core.dependencies import get_current_user
from app.core.security import hash_password
from app.core.user_view import public_user
from app.db.session import get_db
from app.models.boarding_house import BoardingHouse
from app.models.room import Room
from app.models.user import User
from app.models.user_scope import UserScope
from app.schemas.accounts import (
    CreateLandlordRequest,
    CreateTenantRequest,
    UserCreateRequest,
    UserUpdateRequest,
)


router = APIRouter(prefix="/api", tags=["Accounts"])


def _forbidden():
    return HTTPException(403, {"code": "FORBIDDEN", "message": "Bạn không có quyền thực hiện thao tác này."})


def _now():
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _require_admin(user: User, db: Session):
    if user.role != "admin":
        write_audit(db, actor_id=user.id, action="authorization_denied", target_type="user",
                    target_id=user.id, summary="Bị từ chối thao tác quản trị tài khoản", result="denied")
        db.commit()
        raise _forbidden()


def _ids(values: list[str]) -> set[str]:
    return {str(value).strip() for value in values if str(value).strip()}


def _validate_scope(db: Session, role: str, scope: dict):
    house_ids = _ids(scope.get("boardingHouseIds", []))
    room_ids = _ids(scope.get("roomIds", []))
    if role == "landlord":
        if any(not re.fullmatch(r"[1-9][0-9]*", value) for value in house_ids):
            raise HTTPException(422, {"code": "INVALID_SCOPE", "message": "Phạm vi nhà trọ không hợp lệ."})
        numeric_houses = {int(value) for value in house_ids}
        if (not numeric_houses or db.query(BoardingHouse).filter(BoardingHouse.id.in_(numeric_houses)).count() != len(numeric_houses)):
            raise HTTPException(422, {"code": "INVALID_SCOPE", "message": "Phạm vi nhà trọ không hợp lệ."})
        if room_ids:
            raise HTTPException(422, {"code": "INVALID_SCOPE", "message": "Landlord chỉ nhận phạm vi nhà trọ."})
    elif role == "tenant":
        if not room_ids or db.query(Room).filter(Room.id.in_(room_ids)).count() != len(room_ids):
            raise HTTPException(422, {"code": "INVALID_SCOPE", "message": "Phạm vi phòng không hợp lệ."})
        if house_ids:
            raise HTTPException(422, {"code": "INVALID_SCOPE", "message": "Tenant chỉ nhận phạm vi phòng."})
    elif house_ids or room_ids:
        raise HTTPException(422, {"code": "INVALID_SCOPE", "message": "Admin không nhận scope riêng."})
    return house_ids, room_ids


def _replace_scope(db: Session, user: User, role: str, scope: dict, actor: User):
    house_ids, room_ids = _validate_scope(db, role, scope)
    old_houses = db.query(BoardingHouse).filter(BoardingHouse.landlord_id == user.id).all()
    selected_house_ints = {int(i) for i in house_ids}
    # houses.owner_id is NOT NULL in the canonical schema. Removed ownership is
    # transferred to the administering account instead of deleting or migrating rows.
    for house in old_houses:
        if house.id not in selected_house_ints:
            house.landlord_id = actor.id
    for house_id in selected_house_ints:
        house = db.query(BoardingHouse).filter(BoardingHouse.id == house_id).first()
        house.landlord_id = user.id

    now = _now()
    current_links = db.query(UserScope).filter(
        UserScope.user_id == user.id,
        UserScope.started_at <= now,
        (UserScope.ended_at.is_(None)) | (UserScope.ended_at > now),
    ).all()
    for link in current_links:
        if link.room_id not in room_ids:
            link.ended_at = now
    linked_rooms = {link.room_id for link in current_links}
    for room_id in room_ids - linked_rooms:
        db.add(UserScope(user_id=user.id, room_id=room_id, started_at=now, ended_at=None))


@router.get("/users")
def list_users(
    q: str | None = None,
    role: str | None = Query(default=None, pattern="^(admin|landlord|tenant)$"),
    locked: bool | None = None,
    page: int = Query(default=1, ge=1),
    pageSize: int = Query(default=20, ge=1, le=100),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _require_admin(current_user, db)
    query = db.query(User)
    if role:
        query = query.filter(User.role == role)
    if locked is not None:
        query = query.filter(User.is_locked == locked)
    if q:
        query = query.filter(func.lower(User.username).contains(q.strip().lower()) |
                             func.lower(func.coalesce(User.display_name, "")).contains(q.strip().lower()))
    total = query.count()
    users = query.order_by(User.username).offset((page - 1) * pageSize).limit(pageSize).all()
    return {"items": [public_user(db, user) for user in users], "total": total, "page": page, "pageSize": pageSize}


@router.post("/users", status_code=status.HTTP_201_CREATED)
def create_user(
    payload: UserCreateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _require_admin(current_user, db)
    username = payload.username.strip().lower()
    if db.query(User).filter(func.lower(User.username) == username).first():
        raise HTTPException(409, {"code": "USERNAME_TAKEN", "message": "Tên đăng nhập đã có người dùng."})
    _validate_scope(db, payload.role, payload.scope.model_dump())
    user = User(username=username, password_hash=hash_password(payload.password),
                display_name=payload.displayName.strip(), role=payload.role,
                status="active", created_at=_now())
    try:
        db.add(user)
        db.flush()
        _replace_scope(db, user, payload.role, payload.scope.model_dump(), current_user)
        write_audit(db, actor_id=current_user.id, action="user_created", target_type="user",
                    target_id=user.id, summary=f"Tạo tài khoản {username} ({payload.role})")
        db.commit()
        db.refresh(user)
        return public_user(db, user)
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(409, {"code": "USERNAME_TAKEN", "message": "Tên đăng nhập đã có người dùng."}) from exc
    except Exception:
        db.rollback()
        raise


@router.patch("/users/{user_id}")
def update_user(
    user_id: str,
    payload: UserUpdateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _require_admin(current_user, db)
    try:
        numeric_id = int(user_id)
    except ValueError:
        numeric_id = -1
    user = db.query(User).filter(User.id == numeric_id).first()
    if user is None:
        raise HTTPException(404, {"code": "NOT_FOUND", "message": "Không tìm thấy tài khoản."})
    _validate_scope(db, payload.role, payload.scope.model_dump())
    if user.role == "admin" and payload.role != "admin" and not user.is_locked:
        other_admins = db.query(User).filter(User.role == "admin", User.status == "active", User.id != user.id).count()
        if other_admins == 0:
            raise HTTPException(409, {"code": "LAST_ADMIN", "message": "Phải còn ít nhất một quản trị viên đang hoạt động."})
    user.display_name = payload.displayName.strip()
    user.role = payload.role
    try:
        _replace_scope(db, user, payload.role, payload.scope.model_dump(), current_user)
        write_audit(db, actor_id=current_user.id, action="user_updated", target_type="user",
                    target_id=user.id, summary=f"Cập nhật tài khoản {user.username}")
        db.commit()
        db.refresh(user)
        return public_user(db, user)
    except Exception:
        db.rollback()
        raise


def _set_locked(user_id: str, locked: bool, current_user: User, db: Session):
    _require_admin(current_user, db)
    try:
        numeric_id = int(user_id)
    except ValueError:
        numeric_id = -1
    user = db.query(User).filter(User.id == numeric_id).first()
    if user is None:
        raise HTTPException(404, {"code": "NOT_FOUND", "message": "Không tìm thấy tài khoản."})
    if locked and user.id == current_user.id:
        write_audit(db, actor_id=current_user.id, action="authorization_denied", target_type="user",
                    target_id=user.id, summary="Từ chối tự khóa tài khoản", result="denied")
        db.commit()
        raise HTTPException(409, {"code": "CANNOT_LOCK_SELF", "message": "Không thể tự khóa tài khoản của mình."})
    if locked and user.role == "admin" and user.status == "active":
        admins = db.query(User).filter(User.role == "admin", User.status == "active").count()
        if admins <= 1:
            write_audit(db, actor_id=current_user.id, action="authorization_denied", target_type="user",
                        target_id=user.id, summary="Từ chối khóa quản trị viên cuối cùng", result="denied")
            db.commit()
            raise HTTPException(409, {"code": "LAST_ADMIN", "message": "Phải còn ít nhất một quản trị viên đang hoạt động."})
    user.status = "locked" if locked else "active"
    event = "user_locked" if locked else "user_unlocked"
    write_audit(db, actor_id=current_user.id, action=event, target_type="user",
                target_id=user.id, summary=f"{'Khóa' if locked else 'Mở khóa'} tài khoản {user.username}")
    db.commit()
    db.refresh(user)
    return public_user(db, user)


@router.post("/users/{user_id}/lock")
def lock_user(user_id: str, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return _set_locked(user_id, True, current_user, db)


@router.post("/users/{user_id}/unlock")
def unlock_user(user_id: str, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return _set_locked(user_id, False, current_user, db)


# Existing BE account creation routes remain available for workflows not exposed by the frontend.
@router.post("/accounts/landlords", status_code=status.HTTP_201_CREATED)
def create_landlord(payload: CreateLandlordRequest, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    _require_admin(current_user, db)
    if db.query(User).filter(func.lower(User.username) == payload.username.lower()).first():
        raise HTTPException(409, {"code": "USERNAME_TAKEN", "message": "Username đã tồn tại"})
    if payload.boarding_house_ids:
        _validate_scope(db, "landlord", {"boardingHouseIds": payload.boarding_house_ids, "roomIds": []})
    landlord = User(username=payload.username.lower(), password_hash=hash_password(payload.password),
                    display_name=payload.display_name.strip(), role="landlord", status="active", created_at=_now())
    try:
        db.add(landlord)
        db.flush()
        if payload.boarding_house_ids:
            _replace_scope(db, landlord, "landlord",
                           {"boardingHouseIds": payload.boarding_house_ids, "roomIds": []}, current_user)
        write_audit(db, actor_id=current_user.id, action="user_created", target_type="user",
                    target_id=landlord.id, summary=f"Admin {current_user.username} tạo tài khoản landlord {landlord.username}")
        db.commit()
        db.refresh(landlord)
        return {"message": "Tạo tài khoản landlord thành công", "user": {
            "id": landlord.id, "username": landlord.username,
            "display_name": landlord.display_name, "role": landlord.role,
        }}
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(409, {"code": "USERNAME_TAKEN", "message": "Username đã tồn tại"}) from exc
    except Exception:
        db.rollback()
        raise


@router.post("/accounts/tenants", status_code=status.HTTP_201_CREATED)
def create_tenant(payload: CreateTenantRequest, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if current_user.role != "landlord":
        write_audit(db, actor_id=current_user.id, action="authorization_denied", target_type="user",
                    target_id=current_user.id, summary="Bị từ chối tạo tài khoản tenant", result="denied")
        db.commit()
        raise _forbidden()
    room = db.query(Room).filter(Room.id == payload.room_id).first()
    if room is None:
        raise HTTPException(404, {"code": "NOT_FOUND", "message": "Không tìm thấy phòng."})
    house = db.query(BoardingHouse).filter(BoardingHouse.id == room.boarding_house_id).first()
    if house is None or house.landlord_id != current_user.id:
        raise _forbidden()
    username = payload.username.strip().lower()
    if db.query(User).filter(func.lower(User.username) == username).first():
        raise HTTPException(409, {"code": "USERNAME_TAKEN", "message": "Tên đăng nhập đã có người dùng."})
    tenant = User(username=username, password_hash=hash_password(payload.password),
                  display_name=payload.display_name.strip(), role="tenant", status="active", created_at=_now())
    try:
        db.add(tenant)
        db.flush()
        db.add(UserScope(user_id=tenant.id, room_id=room.id, started_at=_now()))
        write_audit(db, actor_id=current_user.id, action="user_created", target_type="user",
                    target_id=tenant.id, summary=f"Tạo tài khoản tenant {username} cho phòng {room.name}", room_id=room.id)
        db.commit()
        db.refresh(tenant)
        return {"message": "Tạo tài khoản tenant thành công", "user": {
            "id": tenant.id, "username": tenant.username, "display_name": tenant.display_name,
            "role": tenant.role, "room_id": room.id, "room_name": room.name,
        }}
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(409, {"code": "USERNAME_TAKEN", "message": "Tên đăng nhập đã có người dùng."}) from exc
    except Exception:
        db.rollback()
        raise
