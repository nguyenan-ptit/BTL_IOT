
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from datetime import datetime, timezone

from app.models.audit_log import AuditLog
from app.models.incident_acknowledgement import IncidentAcknowledgement
from app.models.incident_timeline import IncidentTimeline

from app.db.session import get_db
from app.core.dependencies import get_current_user
from app.core.access import can_access_room
from app.models.user import User
from app.models.user_scope import UserScope
from app.models.room import Room
from app.models.incident import Incident


router = APIRouter(
    prefix="/api/incidents",
    tags=["Incidents"],
)


@router.get("")
def get_incidents(
    incident_status: str | None = Query(
        default=None,
        alias="status",
        pattern="^(open|acknowledged|resolved)$",
    ),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    query = db.query(Incident)

    # Admin được xem toàn bộ sự cố
    if current_user.role != "admin":
        scopes = (
            db.query(UserScope)
            .filter(UserScope.user_id == current_user.id)
            .all()
        )

        allowed_room_ids = {
            scope.room_id
            for scope in scopes
            if scope.room_id is not None
        }

        allowed_house_ids = {
            scope.boarding_house_id
            for scope in scopes
            if scope.boarding_house_id is not None
        }

        if not allowed_room_ids and not allowed_house_ids:
            return {"total": 0, "incidents": []}

        query = (
            query.join(Room, Incident.room_id == Room.id)
            .filter(
                (Room.id.in_(allowed_room_ids))
                | (Room.boarding_house_id.in_(allowed_house_ids))
            )
        )

    if incident_status:
        query = query.filter(Incident.status == incident_status)

    incidents = (
        query.order_by(Incident.started_at.desc())
        .all()
    )

    return {
        "total": len(incidents),
        "incidents": [
            {
                "incident_id": incident.id,
                "room_id": incident.room_id,
                "status": incident.status,
                "signs": incident.signs,
                "started_at": incident.started_at.isoformat(),
                "resolved_at": (
                    incident.resolved_at.isoformat()
                    if incident.resolved_at else None
                ),
            }
            for incident in incidents
        ],
    }


@router.get("/{incident_id}")
def get_incident_detail(
    incident_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    incident = (
        db.query(Incident)
        .filter(Incident.id == incident_id)
        .first()
    )

    if incident is None:
        raise HTTPException(
            status_code=404,
            detail="Không tìm thấy sự cố",
        )

    if not can_access_room(
        incident.room_id,
        current_user,
        db,
    ):
        raise HTTPException(
            status_code=403,
            detail="Bạn không có quyền truy cập sự cố này",
        )

    return {
        "incident_id": incident.id,
        "room_id": incident.room_id,
        "status": incident.status,
        "signs": incident.signs,
        "started_at": incident.started_at.isoformat(),
        "resolved_at": (
            incident.resolved_at.isoformat()
            if incident.resolved_at else None
        ),
    }


@router.post("/{incident_id}/acknowledgements")
def acknowledge_incident(
    incident_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    incident = (
        db.query(Incident)
        .filter(Incident.id == incident_id)
        .first()
    )

    if incident is None:
        raise HTTPException(
            status_code=404,
            detail="Không tìm thấy sự cố",
        )

    if not can_access_room(
        incident.room_id,
        current_user,
        db,
    ):
        raise HTTPException(
            status_code=403,
            detail="Bạn không có quyền truy cập sự cố này",
        )

    if incident.status == "resolved":
        raise HTTPException(
            status_code=409,
            detail="Sự cố đã được xử lý, không thể xác nhận tiếp nhận",
        )

    existing = (
        db.query(IncidentAcknowledgement)
        .filter(
            IncidentAcknowledgement.incident_id == incident_id,
            IncidentAcknowledgement.user_id == current_user.id,
        )
        .first()
    )

    if existing:
        return {
            "message": "Bạn đã xác nhận sự cố này trước đó",
            "incident_id": incident_id,
            "acknowledged_at": existing.acknowledged_at.isoformat(),
            "status": incident.status,
        }

    # Dùng datetime naive vì các cột MySQL đang là DateTime không timezone.
    now = datetime.now(timezone.utc).replace(tzinfo=None)

    try:
        acknowledgement = IncidentAcknowledgement(
            incident_id=incident_id,
            user_id=current_user.id,
            acknowledged_at=now,
        )
        db.add(acknowledgement)

        # Chỉ chuyển trạng thái khi sự cố đang mở.
        if incident.status == "open":
            incident.status = "acknowledged"

        timeline = IncidentTimeline(
            incident_id=incident_id,
            actor_user_id=current_user.id,
            event_type="acknowledged",
            description=(
                f"{current_user.username} đã xác nhận tiếp nhận sự cố"
            ),
            measurement_snapshot=None,
            event_at=now,
        )
        db.add(timeline)

        db.commit()

    except Exception:
        db.rollback()
        raise

    return {
        "message": "Đã xác nhận tiếp nhận sự cố",
        "incident_id": incident_id,
        "acknowledged_at": now.isoformat(),
        "status": incident.status,
    }


@router.get("/{incident_id}/timeline")
def get_incident_timeline(
    incident_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    incident = (
        db.query(Incident)
        .filter(Incident.id == incident_id)
        .first()
    )

    if incident is None:
        raise HTTPException(
            status_code=404,
            detail="Không tìm thấy sự cố",
        )

    if not can_access_room(
        incident.room_id,
        current_user,
        db,
    ):
        raise HTTPException(
            status_code=403,
            detail="Bạn không có quyền truy cập sự cố này",
        )

    events = (
        db.query(IncidentTimeline)
        .filter(IncidentTimeline.incident_id == incident_id)
        .order_by(IncidentTimeline.event_at.asc())
        .all()
    )

    return {
        "incident_id": incident_id,
        "total": len(events),
        "timeline": [
            {
                "event_id": event.id,
                "event_type": event.event_type,
                "description": event.description,
                "actor_user_id": event.actor_user_id,
                "measurement_snapshot": event.measurement_snapshot,
                "event_at": event.event_at.isoformat(),
            }
            for event in events
        ],
    }

@router.post("/{incident_id}/resolve")
def resolve_incident(
    incident_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    # 1. Tìm sự cố
    incident = (
        db.query(Incident)
        .filter(Incident.id == incident_id)
        .first()
    )

    if incident is None:
        raise HTTPException(
            status_code=404,
            detail="Không tìm thấy sự cố",
        )

    # 2. Kiểm tra quyền truy cập phòng
    if not can_access_room(incident.room_id, current_user, db):
        raise HTTPException(
            status_code=403,
            detail="Bạn không có quyền xử lý sự cố này",
        )

    # 3. Không xử lý lại sự cố đã resolved
    if incident.status == "resolved":
        raise HTTPException(
            status_code=409,
            detail="Sự cố đã được xử lý trước đó",
        )

    now = datetime.now(timezone.utc).replace(tzinfo=None)

    try:

        previous_status = incident.status
        # 4. Cập nhật trạng thái sự cố
        incident.status = "resolved"
        incident.resolved_at = now

        # 5. Ghi timeline
        timeline = IncidentTimeline(
            incident_id=incident.id,
            actor_user_id=current_user.id,
            event_type="resolved",
            description=(
                f"Sự cố được xử lý bởi "
                f"{current_user.username}"
            ),
            event_at=now,
        )
        db.add(timeline)

        # 6. Ghi audit log
        audit_log = AuditLog(
            actor_user_id=current_user.id,
            action="resolve_incident",
            target_type="incident",
            target_id=incident.id,
            summary=(
                f"{current_user.username} đã xử lý "
                f"sự cố #{incident.id}"
            ),
            metadata_json={
                "previous_status": previous_status,
                "new_status": "resolved",
                "room_id": incident.room_id,
            },
            created_at=now,
        )
        db.add(audit_log)

        # 7. Lưu tất cả cùng lúc
        db.commit()
        db.refresh(incident)

        return {
            "message": "Đã xử lý sự cố thành công",
            "incident_id": incident.id,
            "status": incident.status,
            "resolved_at": incident.resolved_at,
        }

    except Exception:
        db.rollback()
        raise