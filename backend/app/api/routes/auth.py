from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy.orm import Session

from app.core.audit import write_audit
from app.core.config import settings
from app.core.dependencies import get_current_user
from app.core.security import create_access_token, hash_password, verify_password
from app.core.user_view import public_user
from app.db.session import get_db
from app.models.user import User
from app.schemas.auth import ChangePasswordRequest, LoginRequest, ProfileUpdateRequest


router = APIRouter(prefix="/api/auth", tags=["Authentication"])


@router.post("/login")
def login(payload: LoginRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.username == payload.username.strip()).first()
    if user is None:
        write_audit(db, actor_id=None, action="login_failed", target_type="user",
                    target_id=payload.username.strip(), summary="Đăng nhập thất bại", result="failure")
        db.commit()
        raise HTTPException(401, {"code": "INVALID_CREDENTIALS", "message": "Tên đăng nhập hoặc mật khẩu không đúng."})
    if user.status != "active":
        write_audit(db, actor_id=user.id, action="login_failed", target_type="user",
                    target_id=user.id, summary="Đăng nhập bị từ chối do tài khoản bị khóa", result="denied")
        db.commit()
        raise HTTPException(403, {"code": "ACCOUNT_LOCKED", "message": "Tài khoản đã bị khóa."})
    if not verify_password(payload.password, user.password_hash):
        write_audit(db, actor_id=user.id, action="login_failed", target_type="user",
                    target_id=user.id, summary="Đăng nhập thất bại", result="failure")
        db.commit()
        raise HTTPException(401, {"code": "INVALID_CREDENTIALS", "message": "Tên đăng nhập hoặc mật khẩu không đúng."})

    write_audit(db, actor_id=user.id, action="login_succeeded", target_type="user",
                target_id=user.id, summary="Đăng nhập thành công")
    db.commit()
    token = create_access_token(user.id, user.username, user._role)
    return {
        "accessToken": token,
        "tokenType": "Bearer",
        "expiresIn": settings.access_token_expire_minutes * 60,
        "user": public_user(db, user, current=True),
    }


@router.post("/logout", status_code=204)
def logout(response: Response, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    # Bearer tokens are stateless; the client ends its session by discarding the token.
    write_audit(db, actor_id=current_user.id, action="logout", target_type="user",
                target_id=current_user.id, summary="Đăng xuất")
    db.commit()
    response.status_code = 204
    return response


@router.get("/me")
def get_me(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return public_user(db, current_user, current=True)


@router.patch("/me")
def update_me(
    payload: ProfileUpdateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    from app.core.audit import write_audit

    current_user.display_name = payload.displayName.strip()
    write_audit(db, actor_id=current_user.id, action="profile_updated", target_type="user",
                target_id=current_user.id, summary="Cập nhật thông tin cá nhân")
    db.commit()
    db.refresh(current_user)
    return public_user(db, current_user, current=True)


@router.post("/change-password", status_code=204)
def change_password(
    payload: ChangePasswordRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    from fastapi import HTTPException
    from app.core.audit import write_audit

    if not verify_password(payload.currentPassword, current_user.password_hash):
        write_audit(db, actor_id=current_user.id, action="password_change_failed", target_type="user",
                    target_id=current_user.id, summary="Đổi mật khẩu thất bại", result="failure")
        db.commit()
        raise HTTPException(401, {"code": "INVALID_CURRENT_PASSWORD", "message": "Mật khẩu hiện tại không đúng."})
    if payload.currentPassword == payload.newPassword:
        raise HTTPException(422, {"code": "VALIDATION_ERROR", "message": "Mật khẩu mới phải khác mật khẩu hiện tại."})
    current_user.password_hash = hash_password(payload.newPassword)
    write_audit(db, actor_id=current_user.id, action="password_changed", target_type="user",
                target_id=current_user.id, summary="Đổi mật khẩu thành công")
    db.commit()
    return None
