
from sqlalchemy import (
    Column,
    BigInteger,
    DateTime,
    String,
    Text,
    ForeignKey,
    JSON,
)

from app.db.session import Base


class IncidentTimeline(Base):
    __tablename__ = "incident_timeline"

    id = Column(BigInteger, primary_key=True, autoincrement=True)

    incident_id = Column(
        BigInteger,
        ForeignKey("incidents.id"),
        nullable=False,
    )

    actor_user_id = Column(
        BigInteger,
        ForeignKey("users.id"),
        nullable=True,
    )

    event_type = Column(String(40), nullable=False)

    description = Column(Text, nullable=True)

    measurement_snapshot = Column(JSON, nullable=True)

    event_at = Column(DateTime, nullable=False)
