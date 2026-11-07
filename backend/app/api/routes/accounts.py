from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError

from app.db.session import get_db
from app.core.dependencies import get_current_user
from app.core.security import hash_password

from app.models.user import User
from app.models.user_scope import UserScope
from app.models.room import Room
from app.models.boarding_house import BoardingHouse
from app.models.audit_log import AuditLog

from app.schemas.accounts import (
    CreateLandlordRequest,
    CreateTenantRequest,
)

router = APIRouter(
    prefix="/api/accounts",
    tags=["Accounts"],
)


def get_now():
    # Database đang dùng DateTime không có timezone
    return datetime.now(timezone.utc).replace(tzinfo=None)


def check_username_available(db: Session, username: str):
    existing_user = (
        db.query(User)
        .filter(User.username == username)
        .first()
    )

    if existing_user:
        raise HTTPException(
            status_code=409,
            detail="Username đã tồn tại",
        )


def write_audit_log(
    db: Session,
    actor_user_id: int,
    action: str,
    target_id: int,
    summary: str,
):
    db.add(
        AuditLog(
            actor_user_id=actor_user_id,
            action=action,
            target_type="user",
            target_id=target_id,
            summary=summary,
            metadata_json=None,
            created_at=get_now(),
        )
    )


# =====================================================
# 1. ADMIN TẠO TÀI KHOẢN LANDLORD
# POST /api/accounts/landlords
# =====================================================

@router.post("/landlords", status_code=201)
def create_landlord(
    request: CreateLandlordRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if current_user.role != "admin":
        raise HTTPException(
            status_code=403,
            detail="Chỉ admin mới được tạo tài khoản landlord",
        )

    check_username_available(db, request.username)

    landlord = User(
        username=request.username,
        password_hash=hash_password(request.password),
        display_name=request.display_name,
        role="landlord",
        is_locked=False,
        created_at=get_now(),
    )

    try:
        db.add(landlord)
        db.flush()

        write_audit_log(
            db=db,
            actor_user_id=current_user.id,
            action="create_landlord",
            target_id=landlord.id,
            summary=(
                f"Admin {current_user.username} tạo "
                f"tài khoản landlord {landlord.username}"
            ),
        )

        db.commit()
        db.refresh(landlord)

        return {
            "message": "Tạo tài khoản landlord thành công",
            "user": {
                "id": landlord.id,
                "username": landlord.username,
                "display_name": landlord.display_name,
                "role": landlord.role,
            },
        }

    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=409,
            detail="Username đã tồn tại hoặc dữ liệu bị trùng",
        )

    except Exception:
        db.rollback()
        raise


# =====================================================
# 2. LANDLORD TẠO TÀI KHOẢN TENANT CHO MỘT PHÒNG
# POST /api/accounts/tenants
# =====================================================

@router.post("/tenants", status_code=201)
def create_tenant(
    request: CreateTenantRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if current_user.role != "landlord":
        raise HTTPException(
            status_code=403,
            detail="Chỉ landlord mới được tạo tài khoản tenant",
        )

    # Tìm phòng và nhà trọ tương ứng
    room = (
        db.query(Room)
        .filter(Room.id == request.room_id)
        .first()
    )

    if room is None:
        raise HTTPException(
            status_code=404,
            detail="Không tìm thấy phòng",
        )

    boarding_house = (
        db.query(BoardingHouse)
        .filter(
            BoardingHouse.id == room.boarding_house_id
        )
        .first()
    )

    # Không cho landlord tạo tenant ở nhà trọ của người khác
    if (
        boarding_house is None
        or boarding_house.landlord_id != current_user.id
    ):
        raise HTTPException(
            status_code=403,
            detail="Bạn không quản lý phòng này",
        )

    check_username_available(db, request.username)

    tenant = User(
        username=request.username,
        password_hash=hash_password(request.password),
        display_name=request.display_name,
        role="tenant",
        is_locked=False,
        created_at=get_now(),
    )

    try:
        db.add(tenant)
        db.flush()

        # Cấp quyền truy cập đúng phòng
        scope = UserScope(
            user_id=tenant.id,
            boarding_house_id=None,
            room_id=room.id,
        )
        db.add(scope)

        write_audit_log(
            db=db,
            actor_user_id=current_user.id,
            action="create_tenant",
            target_id=tenant.id,
            summary=(
                f"Landlord {current_user.username} tạo "
                f"tài khoản tenant {tenant.username} "
                f"cho phòng {room.name}"
            ),
        )

        db.commit()
        db.refresh(tenant)

        return {
            "message": "Tạo tài khoản tenant thành công",
            "user": {
                "id": tenant.id,
                "username": tenant.username,
                "display_name": tenant.display_name,
                "role": tenant.role,
                "room_id": room.id,
                "room_name": room.name,
            },
        }

    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=409,
            detail="Username đã tồn tại hoặc dữ liệu bị trùng",
        )

    except Exception:
        db.rollback()
        raise