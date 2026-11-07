from sqlalchemy import Column, BigInteger, DateTime, String, Text, ForeignKey, JSON
from app.db.session import Base


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id = Column(BigInteger, primary_key=True, autoincrement=True)

    actor_user_id = Column(
        BigInteger,
        ForeignKey("users.id"),
        nullable=True,
    )

    action = Column(String(100), nullable=False)
    target_type = Column(String(50), nullable=False)
    target_id = Column(BigInteger, nullable=True)

    summary = Column(Text, nullable=True)
    metadata_json = Column("metadata", JSON, nullable=True)

    created_at = Column(DateTime, nullable=False)