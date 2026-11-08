from datetime import datetime

from sqlalchemy import Column, DateTime, ForeignKey, Integer, JSON, String, Text
from sqlalchemy.ext.hybrid import hybrid_property

from app.db.session import Base


class Incident(Base):
    """Compatibility view of canonical incidents; no new table is created."""

    __tablename__ = "incidents"

    id = Column("incident_id", Integer, primary_key=True, autoincrement=True)
    device_id = Column(String(64), ForeignKey("devices.device_id"), nullable=False)
    room_id = Column(String(20), ForeignKey("rooms.room_id"), nullable=True)
    alert_type = Column(String(50), nullable=False)
    message = Column(Text, nullable=True)
    _status = Column("status", String(20), nullable=False)
    signs = Column("trigger_details", JSON, nullable=True)
    handled_by = Column(Integer, ForeignKey("users.user_id"), nullable=True)
    handled_at = Column(DateTime, nullable=True)
    recovered_at = Column(DateTime, nullable=True)
    closed_by = Column(Integer, ForeignKey("users.user_id"), nullable=True)
    closed_at = Column(DateTime, nullable=True)
    started_at = Column("created_at", DateTime, nullable=False)

    @hybrid_property
    def status(self):
        return {"handling": "acknowledged", "recovered": "resolved", "closed": "resolved"}.get(self._status, self._status)

    @status.setter
    def status(self, value):
        self._status = {"acknowledged": "handling", "resolved": "closed"}.get(value, value)

    @hybrid_property
    def resolved_at(self):
        return self.closed_at or self.recovered_at

    @resolved_at.setter
    def resolved_at(self, value: datetime | None):
        self.closed_at = value
