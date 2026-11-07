from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
import jwt
from sqlalchemy.orm import Session

from app.core.security import decode_access_token
from app.db.session import get_db
from app.models.user import User


SESSION_COOKIE = "btl_access"
bearer_scheme = HTTPBearer(auto_error=False)


def unauthenticated() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail={"code": "UNAUTHENTICATED", "message": "Vui lòng đăng nhập lại."},
        headers={"WWW-Authenticate": "Bearer"},
    )


def get_current_user(
    request: Request,
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    db: Session = Depends(get_db),
) -> User:
    token = request.cookies.get(SESSION_COOKIE)
    if not token and credentials is not None:
        token = credentials.credentials
    if not token:
        raise unauthenticated()

    try:
        payload = decode_access_token(token)
        user_id = payload["user_id"]
        if type(user_id) is not int or user_id <= 0 or payload["sub"] != str(user_id):
            raise ValueError("Invalid subject")
    except jwt.InvalidTokenError as exc:
        raise unauthenticated() from exc
    except (KeyError, TypeError, ValueError, OverflowError) as exc:
        raise unauthenticated() from exc

    user = db.query(User).filter(User.id == user_id).first()
    if user is None or user.status != "active" or user._role != payload["role"]:
        raise unauthenticated()
    return user
