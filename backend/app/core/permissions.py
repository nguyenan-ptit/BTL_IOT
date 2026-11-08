
from fastapi import Depends, HTTPException, status

from app.core.dependencies import get_current_user
from app.models.user import User


def require_roles(*allowed_roles: str):
    """
    Chỉ cho phép người dùng có role nằm trong allowed_roles.
    Dùng làm dependency cho các API cần giới hạn vai trò.
    """

    def check_role(
        current_user: User = Depends(get_current_user),
    ) -> User:
        if current_user.role not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Bạn không có quyền thực hiện thao tác này",
            )

        return current_user

    return check_role
