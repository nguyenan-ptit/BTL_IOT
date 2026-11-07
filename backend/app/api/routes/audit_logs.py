from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.core.dependencies import get_current_user
from app.models.user import User
from app.models.audit_log import AuditLog

router = APIRouter(
    prefix="/api/audit-logs",
    tags=["Audit Logs"],
)


@router.get("")
def get_audit_logs(
    action: str | None = None,
    target_type: str | None = None,
    limit: int = Query(default=50, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    # Chỉ admin được xem nhật ký toàn hệ thống
    if current_user.role != "admin":
        raise HTTPException(
            status_code=403,
            detail="Bạn không có quyền xem audit logs",
        )

    query = db.query(AuditLog)

    # Lọc theo hành động, ví dụ resolve_incident
    if action:
        query = query.filter(AuditLog.action == action)

    # Lọc theo loại đối tượng, ví dụ incident
    if target_type:
        query = query.filter(
            AuditLog.target_type == target_type
        )

    total = query.count()

    logs = (
        query.order_by(AuditLog.created_at.desc(), AuditLog.id.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )

    return {
        "total": total,
        "limit": limit,
        "offset": offset,
        "items": [
            {
                "id": log.id,
                "actor_user_id": log.actor_user_id,
                "action": log.action,
                "target_type": log.target_type,
                "target_id": log.target_id,
                "summary": log.summary,
                "metadata": log.metadata_json,
                "created_at": log.created_at,
            }
            for log in logs
        ],
    }