
from sqlalchemy import Column, BigInteger, String, DateTime, ForeignKey
from app.db.session import Base


class Node(Base):
    __tablename__ = "nodes"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    code = Column(String(100), nullable=False, unique=True)
    room_id = Column(
        BigInteger,
        ForeignKey("rooms.id"),
        nullable=True,
    )
    lifecycle = Column(String(30), nullable=False)
    connectivity = Column(String(30), nullable=False)
    last_seen_at = Column(DateTime, nullable=True)
