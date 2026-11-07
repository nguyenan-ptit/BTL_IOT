
from sqlalchemy import Column, BigInteger, DateTime, ForeignKey, UniqueConstraint

from app.db.session import Base


class IncidentAcknowledgement(Base):
    __tablename__ = "incident_acknowledgements"

    __table_args__ = (
        UniqueConstraint(
            "incident_id",
            "user_id",
            name="uq_incident_ack_user",
        ),
    )

    id = Column(BigInteger, primary_key=True, autoincrement=True)

    incident_id = Column(
        BigInteger,
        ForeignKey("incidents.id"),
        nullable=False,
    )

    user_id = Column(
        BigInteger,
        ForeignKey("users.id"),
        nullable=False,
    )

    acknowledged_at = Column(DateTime, nullable=False)
