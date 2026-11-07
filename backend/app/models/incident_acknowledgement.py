from sqlalchemy import Column, DateTime, ForeignKey, Integer

from app.db.session import Base


class IncidentAcknowledgement(Base):
    """Maps user acknowledgement to canonical incident_receipts."""

    __tablename__ = "incident_receipts"

    incident_id = Column(Integer, ForeignKey("incidents.incident_id"), primary_key=True)
    user_id = Column(Integer, ForeignKey("users.user_id"), primary_key=True)
    acknowledged_at = Column("seen_at", DateTime, nullable=True)
