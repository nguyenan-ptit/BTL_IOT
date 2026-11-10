import json

from sqlalchemy import BigInteger, Column, DateTime, Float, ForeignKey, Integer, String, Text

from app.db.session import Base


class Measurement(Base):
    """Read-only compatibility view of canonical telemetry history."""

    __tablename__ = "history"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    node_id = Column("device_id", ForeignKey("devices.device_id"), nullable=False)
    room_id = Column(String(20), ForeignKey("rooms.room_id"), nullable=True)
    measured_at = Column("timestamp", DateTime, nullable=False)
    received_at = Column("created_at", DateTime, nullable=True)
    gas_value = Column("mq2_adc", Integer, nullable=True)
    temperature_value = Column("temperature_c", Float, nullable=True)
    flame_detected = Column("flame_do", Integer, nullable=True)
    raw_payload = Column(Text, nullable=True)

    @property
    def gas_health(self):
        return "ok" if self.gas_value is not None else "fault"

    @property
    def temperature_health(self):
        return "ok" if self.temperature_value is not None else "fault"

    @property
    def flame_health(self):
        return "ok" if self.flame_detected is not None else "fault"

    @property
    def is_backfill(self):
        try:
            payload = json.loads(self.raw_payload) if self.raw_payload else {}
        except (TypeError, ValueError):
            return False
        return isinstance(payload, dict) and payload.get("backfill") is True
