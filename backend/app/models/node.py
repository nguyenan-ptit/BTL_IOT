from sqlalchemy import Column, DateTime, ForeignKey, String, case
from sqlalchemy.ext.hybrid import hybrid_property

from app.db.session import Base


class Node(Base):
    """Compatibility view of the canonical device registry."""

    __tablename__ = "devices"

    id = Column("device_id", String(64), primary_key=True)
    code = Column("device_name", String(100), nullable=False)
    room_id = Column(String(20), ForeignKey("rooms.room_id"), nullable=True)
    _lifecycle = Column("lifecycle_status", String(30), nullable=False)
    last_seen_at = Column(DateTime, nullable=True)

    @hybrid_property
    def lifecycle(self):
        return {"provisioned": "registered", "blocked": "retired", "decommissioned": "retired"}.get(
            self._lifecycle, self._lifecycle
        )

    @lifecycle.expression
    def lifecycle(cls):
        return case(
            (cls._lifecycle == "provisioned", "registered"),
            (cls._lifecycle.in_(("blocked", "decommissioned")), "retired"),
            else_=cls._lifecycle,
        )

    @property
    def connectivity(self):
        if self.last_seen_at is None:
            return "offline"
        from datetime import datetime, timezone
        last_seen = self.last_seen_at.replace(tzinfo=timezone.utc) if self.last_seen_at.tzinfo is None else self.last_seen_at
        return "online" if (datetime.now(timezone.utc) - last_seen).total_seconds() <= 30 else "offline"
