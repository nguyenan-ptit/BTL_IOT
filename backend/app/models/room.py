
from sqlalchemy import Column, BigInteger, String, ForeignKey
from app.db.session import Base


class Room(Base):
    __tablename__ = "rooms"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    boarding_house_id = Column(
        BigInteger,
        ForeignKey("boarding_houses.id"),
        nullable=False,
    )
    name = Column(String(100), nullable=False)
