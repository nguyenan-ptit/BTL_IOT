from sqlalchemy import Column, ForeignKey, String

from app.db.session import Base


class Room(Base):
    __tablename__ = "rooms"

    id = Column("room_id", String(20), primary_key=True)
    boarding_house_id = Column("house_id", ForeignKey("houses.house_id"), nullable=False)
    name = Column("room_name", String(50), nullable=False)
