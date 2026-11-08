from datetime import datetime, timezone
import json

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.core.access import can_access_room
from app.core.audit import write_audit
from app.core.dependencies import get_current_user
from app.db.session import get_db
from app.models.boarding_house import BoardingHouse
from app.models.incident import Incident
from app.models.incident_acknowledgement import IncidentAcknowledgement
from app.models.measurement import Measurement
from app.models.room import Room
from app.models.user import User
from app.models.user_scope import UserScope


router = APIRouter(prefix="/api/incidents", tags=["Incidents"])
HAZARD_TYPES = {"gas", "high_temperature", "flame"}


def _iso(value):
    if value is None:
        return None
    return (value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value).isoformat()


def _signs(incident: Incident) -> list[str]:
    value = incident.signs
    if isinstance(value, list):
        signs = [item for item in value if item in HAZARD_TYPES]
        if signs:
            return signs
    if isinstance(value, dict):
        signs = value.get("signs")
        if isinstance(signs, list):
            signs = [item for item in signs if item in HAZARD_TYPES]
            if signs:
                return signs
        else:
            signs = [key for key in HAZARD_TYPES if value.get(key) is True]
            if signs:
                return signs
    alert = (incident.alert_type or "").lower()
    if "gas" in alert:
        return ["gas"]
    if "temp" in alert or "heat" in alert or "fire" in alert:
        return ["high_temperature"]
    if "flame" in alert:
        return ["flame"]
    return []


def _measurement_dict(row: Measurement | None):
    if row is None:
        return None
    received = row.received_at or row.measured_at
    try:
        payload = json.loads(row.raw_payload) if row.raw_payload else {}
    except (TypeError, ValueError):
        payload = {}
    flame_data = payload.get("flame") if isinstance(payload, dict) and isinstance(payload.get("flame"), dict) else {}
    gas_data = payload.get("mq2") if isinstance(payload, dict) and isinstance(payload.get("mq2"), dict) else {}
    temperature_data = payload.get("temperature") if isinstance(payload, dict) and isinstance(payload.get("temperature"), dict) else {}
    flame = flame_data.get("alarm") if flame_data.get("health") == "ok" and type(flame_data.get("alarm")) is bool else None
    return {
        "measuredAt": _iso(row.measured_at),
        "receivedAt": _iso(received),
        "isBackfill": False,
        "gas": row.gas_value if gas_data.get("health") == "ok" else None,
        "temperature": row.temperature_value if temperature_data.get("health") == "ok" else None,
        "flame": flame,
    }


def _incident_public(db: Session, incident: Incident, viewer: User, *, detail=False):
    room = db.query(Room).filter(Room.id == incident.room_id).first()
    links = db.query(IncidentAcknowledgement, User).join(
        User, User.id == IncidentAcknowledgement.user_id
    ).filter(IncidentAcknowledgement.incident_id == incident.id,
             IncidentAcknowledgement.acknowledged_at.is_not(None)).order_by(
                 IncidentAcknowledgement.acknowledged_at.asc()).all()
    history_query = db.query(Measurement).filter(
        Measurement.node_id == incident.device_id,
        Measurement.room_id == incident.room_id,
        Measurement.measured_at >= incident.started_at,
    )
    incident_end = incident.recovered_at or incident.closed_at
    if incident_end is not None:
        history_query = history_query.filter(Measurement.measured_at <= incident_end)
    history = history_query.order_by(Measurement.measured_at.asc(), Measurement.id.asc()).all()
    first = _measurement_dict(history[0] if history else None)
    latest = _measurement_dict(history[-1] if history else None)
    if first is None:
        first = {"measuredAt": _iso(incident.started_at), "receivedAt": _iso(incident.started_at),
                 "isBackfill": False, "gas": None, "temperature": None, "flame": None}
    if latest is None:
        latest = first
    acknowledgements = []
    events = [{"at": _iso(incident.started_at), "kind": "detected", "measurement": first,
               "actor": None, "count": 1}]
    for acknowledgement, actor in links:
        at = _iso(acknowledgement.acknowledged_at)
        actor_data = {"id": str(actor.id), "displayName": actor.display_name or actor.username}
        acknowledgements.append({"user": {**actor_data, "role": actor.role}, "at": at})
        events.append({"at": at, "kind": "acknowledged", "measurement": None,
                       "actor": actor_data, "count": 1})
    resolved_at = incident.recovered_at or incident.closed_at
    closer = db.query(User).filter(User.id == incident.closed_by).first() if incident.closed_by else None
    closer_data = ({"id": str(closer.id), "displayName": closer.display_name or closer.username} if closer else None)
    if resolved_at:
        events.append({"at": _iso(resolved_at), "kind": "resolved", "measurement": latest,
                       "actor": closer_data if incident.recovered_at is None else None,
                       "count": 1})
    events.sort(key=lambda event: event["at"])
    result = {
        "id": str(incident.id),
        "roomId": str(incident.room_id or ""),
        "roomName": room.name if room else "",
        "signs": _signs(incident),
        "status": incident.status,
        "startedAt": _iso(incident.started_at),
        "resolvedAt": _iso(resolved_at),
        "recoveredAt": _iso(incident.recovered_at),
        "closedAt": _iso(incident.closed_at),
        "closedBy": closer_data,
        "firstMeasurement": first,
        "latestMeasurement": latest,
        "acknowledgements": acknowledgements,
        "acknowledgedByMe": any(link.user_id == viewer.id for link, _ in links),
    }
    if detail:
        result["timeline"] = events
    return result


def _visible_query(db: Session, user: User):
    query = db.query(Incident).filter(Incident.room_id.is_not(None))
    if user.role == "admin":
        return query
    query = query.join(Room, Incident.room_id == Room.id)
    if user.role == "landlord":
        return query.join(BoardingHouse, BoardingHouse.id == Room.boarding_house_id).filter(
            BoardingHouse.landlord_id == user.id
        ).distinct()
    if user.role == "tenant":
        now = datetime.now(timezone.utc).replace(tzinfo=None)
        return query.join(UserScope, UserScope.room_id == Room.id).filter(
            UserScope.user_id == user.id,
            UserScope.started_at <= now,
            (UserScope.ended_at.is_(None)) | (UserScope.ended_at > now),
        ).distinct()
    return query.filter(False)


def _can_view_incident(incident: Incident, user: User, db: Session, *, audit_denied=False):
    return incident.room_id is not None and can_access_room(
        str(incident.room_id), user, db, audit_denied=audit_denied
    )


def _filtered(db: Session, user: User, room_id: str | None, statuses: list[str], from_: str | None, to: str | None):
    query = _visible_query(db, user)
    invalid_statuses = set(statuses) - {"open", "acknowledged", "resolved"}
    if invalid_statuses:
        raise HTTPException(422, {"code": "VALIDATION_ERROR", "message": "Trạng thái sự cố không hợp lệ."})
    if room_id:
        if not can_access_room(room_id, user, db):
            raise HTTPException(403, {"code": "FORBIDDEN", "message": "Bạn không có quyền truy cập phòng này."})
        query = query.filter(Incident.room_id == room_id)
    if statuses:
        db_statuses = []
        for item in statuses:
            if item == "open": db_statuses.append("open")
            elif item == "acknowledged": db_statuses.append("handling")
            elif item == "resolved": db_statuses.extend(("recovered", "closed"))
        query = query.filter(Incident._status.in_(db_statuses)) if db_statuses else query.filter(False)
    try:
        if from_:
            start = datetime.fromisoformat(from_.replace("Z", "+00:00"))
            start = (start.replace(tzinfo=timezone.utc) if start.tzinfo is None else start).astimezone(timezone.utc).replace(tzinfo=None)
            query = query.filter(Incident.started_at >= start)
        if to:
            end = datetime.fromisoformat(to.replace("Z", "+00:00"))
            end = (end.replace(tzinfo=timezone.utc) if end.tzinfo is None else end).astimezone(timezone.utc).replace(tzinfo=None)
            query = query.filter(Incident.started_at <= end)
    except ValueError as exc:
        raise HTTPException(422, {"code": "VALIDATION_ERROR", "message": "Khoảng thời gian không hợp lệ."}) from exc
    return query


@router.get("")
def list_incidents(
    roomId: str | None = None,
    status: list[str] = Query(default=[]),
    from_: str | None = Query(default=None, alias="from"),
    to: str | None = None,
    page: int = Query(default=1, ge=1),
    pageSize: int = Query(default=20, ge=1, le=100),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    query = _filtered(db, current_user, roomId, status, from_, to)
    total = query.count()
    incidents = query.order_by(Incident.started_at.desc(), Incident.id.desc()).offset((page - 1) * pageSize).limit(pageSize).all()
    return {"items": [_incident_public(db, item, current_user) for item in incidents],
            "total": total, "page": page, "pageSize": pageSize}


@router.get("/active")
def active_incidents(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    query = _filtered(db, current_user, None, ["open", "acknowledged"], None, None)
    return [_incident_public(db, item, current_user) for item in query.order_by(Incident.started_at.desc()).all()]


@router.get("/{incident_id}")
def incident_detail(incident_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    incident = db.query(Incident).filter(Incident.id == incident_id).first()
    if incident is None:
        raise HTTPException(404, {"code": "NOT_FOUND", "message": "Không tìm thấy sự cố."})
    if not _can_view_incident(incident, current_user, db, audit_denied=True):
        raise HTTPException(403, {"code": "FORBIDDEN", "message": "Bạn không có quyền truy cập sự cố này."})
    return _incident_public(db, incident, current_user, detail=True)


@router.post("/{incident_id}/acknowledge")
def acknowledge_incident(incident_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if current_user.role not in ("tenant", "landlord"):
        write_audit(db, actor_id=current_user.id, action="authorization_denied", target_type="incident",
                    target_id=incident_id, summary="Bị từ chối quyền tiếp nhận sự cố", result="denied")
        db.commit()
        raise HTTPException(403, {"code": "FORBIDDEN", "message": "Admin không tiếp nhận sự cố."})
    incident = db.query(Incident).filter(Incident.id == incident_id).with_for_update().first()
    if incident is None:
        raise HTTPException(404, {"code": "NOT_FOUND", "message": "Không tìm thấy sự cố."})
    if not _can_view_incident(incident, current_user, db, audit_denied=True):
        raise HTTPException(403, {"code": "FORBIDDEN", "message": "Bạn không có quyền truy cập sự cố này."})
    if incident._status in ("recovered", "closed"):
        raise HTTPException(409, {"code": "INCIDENT_ALREADY_RESOLVED", "message": "Sự cố đã kết thúc."})
    link = db.query(IncidentAcknowledgement).filter_by(incident_id=incident.id, user_id=current_user.id).first()
    if link is not None and link.acknowledged_at is not None:
        return _incident_public(db, incident, current_user)
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    if link is None:
        link = IncidentAcknowledgement(incident_id=incident.id, user_id=current_user.id, acknowledged_at=now)
        db.add(link)
    elif link.acknowledged_at is None:
        link.acknowledged_at = now
    if incident._status == "open":
        incident._status = "handling"
        incident.handled_by = current_user.id
        incident.handled_at = now
    write_audit(db, actor_id=current_user.id, action="incident_acknowledged", target_type="incident",
                target_id=incident.id, summary=f"{current_user.display_name or current_user.username} tiếp nhận sự cố",
                room_id=incident.room_id)
    db.commit()
    db.refresh(incident)
    return _incident_public(db, incident, current_user)


@router.post("/{incident_id}/acknowledgements", include_in_schema=False)
def acknowledge_legacy(incident_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    existing = db.query(IncidentAcknowledgement).filter_by(
        incident_id=incident_id, user_id=current_user.id
    ).first()
    result = acknowledge_incident(incident_id, current_user, db)
    link = db.query(IncidentAcknowledgement).filter_by(
        incident_id=incident_id, user_id=current_user.id
    ).first()
    return {
        "message": "Bạn đã xác nhận sự cố này trước đó" if existing else "Đã xác nhận tiếp nhận sự cố",
        "incident_id": incident_id,
        "acknowledged_at": _iso(link.acknowledged_at) if link else None,
        "status": result["status"],
    }


@router.get("/{incident_id}/timeline", include_in_schema=False)
def incident_timeline(incident_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    incident = db.query(Incident).filter(Incident.id == incident_id).first()
    if incident is None:
        raise HTTPException(404, {"code": "NOT_FOUND", "message": "Không tìm thấy sự cố."})
    if not _can_view_incident(incident, current_user, db, audit_denied=True):
        raise HTTPException(403, {"code": "FORBIDDEN", "message": "Bạn không có quyền truy cập sự cố này."})
    timeline = _incident_public(db, incident, current_user, detail=True)["timeline"]
    return {"incident_id": incident.id, "total": len(timeline), "timeline": timeline}


@router.post("/{incident_id}/resolve")
def resolve_incident(incident_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if current_user.role not in ("tenant", "landlord"):
        write_audit(db, actor_id=current_user.id, action="authorization_denied", target_type="incident",
                    target_id=incident_id, summary="Bị từ chối quyền xử lý sự cố", result="denied")
        db.commit()
        raise HTTPException(403, {"code": "FORBIDDEN", "message": "Admin không đóng sự cố."})
    incident = db.query(Incident).filter(Incident.id == incident_id).with_for_update().first()
    if incident is None:
        raise HTTPException(404, {"code": "NOT_FOUND", "message": "Không tìm thấy sự cố."})
    if not _can_view_incident(incident, current_user, db, audit_denied=True):
        raise HTTPException(403, {"code": "FORBIDDEN", "message": "Bạn không có quyền xử lý sự cố này."})
    if incident._status == "closed":
        raise HTTPException(409, {"code": "CONFLICT", "message": "Sự cố đã được đóng."})
    if incident._status != "recovered":
        raise HTTPException(409, {"code": "INCIDENT_NOT_RECOVERED",
                                  "message": "Chỉ đóng sự cố sau khi cảm biến báo đã khôi phục."})
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    incident._status = "closed"
    incident.closed_by = current_user.id
    incident.closed_at = now
    write_audit(db, actor_id=current_user.id, action="incident_resolved", target_type="incident",
                target_id=incident.id, summary=f"Xử lý sự cố #{incident.id}", room_id=incident.room_id)
    db.commit()
    db.refresh(incident)
    return {"message": "Đã xử lý sự cố thành công", "incident_id": incident.id,
            "status": incident.status, "resolved_at": incident.resolved_at}
