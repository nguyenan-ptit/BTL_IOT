from fastapi import APIRouter, Depends, Request, Response
from sqlalchemy.orm import Session

from app.core.audit import write_audit
from app.core.config import settings
from app.core.dependencies import SESSION_COOKIE, get_current_user
from app.core.security import create_access_token, hash_password, verify_password
from app.core.user_view import public_user
from app.db.session import get_db
from app.models.user import User
from app.schemas.auth import ChangePasswordRequest, LoginRequest, ProfileUpdateRequest


router = APIRouter(prefix="/api/auth", tags=["Authentication"])


def _cookie_options() -> dict:
    return {
        "key": SESSION_COOKIE,
        "httponly": True,
        "secure": settings.app_env.lower() not in ("development", "dev", "test"),
        "samesite": "lax",
        "path": "/",
        "max_age": settings.access_token_expire_minutes * 60,
    }


@router.post("/login")
def login(payload: LoginRequest, response: Response, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.username == payload.username.strip()).first()
    if user is None:
        write_audit(db, actor_id=None, action="login_failed", target_type="user",
                    target_id=payload.username.strip(), summary="Đăng nhập thất bại", result="failure")
        db.commit()
        from fastapi import HTTPException
        raise HTTPException(401, {"code": "INVALID_CREDENTIALS", "message": "Tên đăng nhập hoặc mật khẩu không đúng."})
    if user.status != "active":
        write_audit(db, actor_id=user.id, action="login_failed", target_type="user",
                    target_id=user.id, summary="Đăng nhập bị từ chối do tài khoản bị khóa", result="denied")
        db.commit()
        from fastapi import HTTPException
        raise HTTPException(403, {"code": "ACCOUNT_LOCKED", "message": "Tài khoản đã bị khóa."})
    if not verify_password(payload.password, user.password_hash):
        write_audit(db, actor_id=user.id, action="login_failed", target_type="user",
                    target_id=user.id, summary="Đăng nhập thất bại", result="failure")
        db.commit()
        from fastapi import HTTPException
        raise HTTPException(401, {"code": "INVALID_CREDENTIALS", "message": "Tên đăng nhập hoặc mật khẩu không đúng."})

    write_audit(db, actor_id=user.id, action="login_succeeded", target_type="user",
                target_id=user.id, summary="Đăng nhập thành công")
    db.commit()
    # The account table uses "owner"; the browser-facing role is "landlord".
    response.set_cookie(value=create_access_token(user.id, user.username, user._role), **_cookie_options())
    return public_user(db, user, current=True)


@router.post("/logout", status_code=204)
def logout(response: Response, request: Request, db: Session = Depends(get_db)):
    token = request.cookies.get(SESSION_COOKIE)
    if token:
        from app.core.security import decode_access_token
        try:
            payload = decode_access_token(token)
            actor_id = payload.get("user_id") if type(payload.get("user_id")) is int else None
            write_audit(db, actor_id=actor_id, action="logout", target_type="user",
                        target_id=actor_id, summary="Đăng xuất")
            db.commit()
        except Exception:
            db.rollback()
    response.delete_cookie(SESSION_COOKIE, path="/", httponly=True,
                           secure=_cookie_options()["secure"], samesite="lax")
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
