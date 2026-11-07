from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.core.dependencies import get_current_user
from app.db.session import get_db
from app.models.audit_log import AuditLog
from app.models.user import User


router = APIRouter(prefix="/api/audit-logs", tags=["Audit Logs"])
FRONTEND_ACTIONS = {
    "user_created", "user_updated", "user_locked", "user_unlocked",
    "node_registered", "node_assigned", "node_transitioned",
    "incident_acknowledged", "threshold_updated",
}


def _parse_time(value: str | None):
    if value is None:
        return None
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
        parsed = parsed.replace(tzinfo=timezone.utc) if parsed.tzinfo is None else parsed
        return parsed.astimezone(timezone.utc).replace(tzinfo=None)
    except ValueError as exc:
        raise HTTPException(422, {"code": "VALIDATION_ERROR", "message": "Khoảng thời gian không hợp lệ."}) from exc


@router.get("")
def get_audit_logs(
    action: list[str] = Query(default=[]),
    from_: str | None = Query(default=None, alias="from"),
    to: str | None = None,
    page: int = Query(default=1, ge=1),
    pageSize: int = Query(default=30, ge=1, le=100),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if current_user.role != "admin":
        raise HTTPException(403, {"code": "FORBIDDEN", "message": "Bạn không có quyền xem nhật ký."})
    query = db.query(AuditLog, User).join(User, User.id == AuditLog.actor_user_id).filter(
        AuditLog.result == "success",
        AuditLog.action.in_(FRONTEND_ACTIONS),
    )
    if action:
        query = query.filter(AuditLog.action.in_(set(action) & FRONTEND_ACTIONS))
    start, end = _parse_time(from_), _parse_time(to)
    if start:
        query = query.filter(AuditLog.created_at >= start)
    if end:
        query = query.filter(AuditLog.created_at <= end)
    total = query.count()
    rows = query.order_by(AuditLog.created_at.desc(), AuditLog.id.desc()).offset((page - 1) * pageSize).limit(pageSize).all()
    items = []
    for log, actor in rows:
        details = log.details if isinstance(log.details, dict) else {}
        at = log.created_at.replace(tzinfo=timezone.utc) if log.created_at.tzinfo is None else log.created_at
        items.append({
            "id": str(log.id),
            "at": at.isoformat(),
            "actor": {"id": str(actor.id), "displayName": actor.display_name or actor.username},
            "action": log.action,
            "target": {
                "type": log.target_type if log.target_type in ("user", "node", "incident", "room") else "user",
                "id": str(log.target_id),
                "label": details.get("label") or details.get("summary") or f"{log.target_type} {log.target_id}",
            },
            "summary": details.get("summary") or "Thao tác hệ thống",
        })
    return {"items": items, "total": total, "page": page, "pageSize": pageSize}
