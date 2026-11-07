
from sqlalchemy import (
    Column,
    BigInteger,
    DateTime,
    Boolean,
    Float,
    String,
    ForeignKey,
)
from app.db.session import Base


class Measurement(Base):
    __tablename__ = "measurements"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    node_id = Column(
        BigInteger,
        ForeignKey("nodes.id"),
        nullable=False,
    )
    measured_at = Column(DateTime, nullable=False)
    received_at = Column(DateTime, nullable=False)
    is_backfill = Column(Boolean, nullable=False, default=False)

    gas_value = Column(Float, nullable=True)
    gas_health = Column(String(20), nullable=False)

    temperature_value = Column(Float, nullable=True)
    temperature_health = Column(String(20), nullable=False)

    flame_detected = Column(Boolean, nullable=True)
    flame_health = Column(String(20), nullable=False)
