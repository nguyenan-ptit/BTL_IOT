
from sqlalchemy import (
    Column,
    BigInteger,
    DateTime,
    String,
    ForeignKey,
    JSON,
)

from app.db.session import Base


class Incident(Base):
    __tablename__ = "incidents"

    id = Column(
        BigInteger,
        primary_key=True,
        autoincrement=True,
    )

    room_id = Column(
        BigInteger,
        ForeignKey("rooms.id"),
        nullable=False,
    )

    status = Column(
        String(20),
        nullable=False,
        default="open",
    )

    signs = Column(JSON, nullable=True)

    started_at = Column(DateTime, nullable=False)

    resolved_at = Column(DateTime, nullable=True)
