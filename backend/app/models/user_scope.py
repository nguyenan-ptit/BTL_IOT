from sqlalchemy import Column, DateTime, ForeignKey, Integer, String

from app.db.session import Base


class UserScope(Base):
    """Time-bounded tenant-to-room occupancy from canonical ``room_users``."""

    __tablename__ = "room_users"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.user_id"), nullable=False)
    room_id = Column(String(20), ForeignKey("rooms.room_id"), nullable=False)
    started_at = Column(DateTime, nullable=False)
    ended_at = Column(DateTime, nullable=True)
