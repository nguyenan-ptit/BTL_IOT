from sqlalchemy import BigInteger, Column, DateTime, ForeignKey, Integer, JSON, String

from app.db.session import Base


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id = Column("log_id", BigInteger, primary_key=True, autoincrement=True)
    actor_user_id = Column(Integer, ForeignKey("users.user_id"), nullable=True)
    room_id = Column(String(20), ForeignKey("rooms.room_id"), nullable=True)
    action = Column(String(64), nullable=False)
    target_type = Column(String(32), nullable=False)
    target_id = Column(String(64), nullable=False)
    result = Column(String(16), nullable=False, default="success")
    details = Column("details", JSON, nullable=True)
    created_at = Column(DateTime, nullable=False)

    @property
    def summary(self):
        return (self.details or {}).get("summary") if isinstance(self.details, dict) else None

    @property
    def metadata_json(self):
        return self.details
