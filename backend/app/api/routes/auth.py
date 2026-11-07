
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models.user import User
from app.schemas.auth import LoginRequest, LoginResponse, LoginUser
from app.core.security import verify_password, create_access_token
from app.core.dependencies import get_current_user

router = APIRouter(prefix="/api/auth", tags=["Authentication"])


@router.post("/login", response_model=LoginResponse)
def login(
    payload: LoginRequest,
    db: Session = Depends(get_db),
):
    # Tìm tài khoản theo username
    user = (
        db.query(User)
        .filter(User.username == payload.username)
        .first()
    )

    # Không tiết lộ tài khoản có tồn tại hay không
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Username hoặc password không đúng",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Từ chối tài khoản bị khóa
    if user.is_locked:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Tài khoản đã bị khóa",
        )

    # Placeholder hoặc hash không hợp lệ sẽ không được chấp nhận
    try:
        password_valid = verify_password(
            payload.password,
            user.password_hash,
        )
    except (ValueError, TypeError):
        password_valid = False

    if not password_valid:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Username hoặc password không đúng",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Tạo JWT sau khi xác thực thành công
    access_token = create_access_token(
        user_id=user.id,
        username=user.username,
        role=user.role,
    )

    return LoginResponse(
        access_token=access_token,
        token_type="bearer",
        user=LoginUser(
            id=user.id,
            username=user.username,
            display_name=user.display_name,
            role=user.role,
        ),
    )


@router.get("/me", response_model=LoginUser)
def get_me(
    current_user: User = Depends(get_current_user),
):
    return LoginUser(
        id=current_user.id,
        username=current_user.username,
        display_name=current_user.display_name,
        role=current_user.role,
    )
