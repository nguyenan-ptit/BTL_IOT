from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.models.audit_log import AuditLog


def write_audit(
    db: Session,
    *,
    actor_id: int | None,
    action: str,
    target_type: str,
    target_id: int | str | None,
    summary: str,
    result: str = "success",
    room_id: str | None = None,
):
    db.add(
        AuditLog(
            actor_user_id=actor_id,
            room_id=room_id,
            action=action[:64],
            target_type=target_type[:32],
            target_id=str(target_id if target_id is not None else "unknown")[:64],
            result=result,
            details={"summary": summary[:1000]},
            created_at=datetime.now(timezone.utc).replace(tzinfo=None),
        )
    )
