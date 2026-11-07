
from sqlalchemy import Column, BigInteger, ForeignKey

from app.db.session import Base


class UserScope(Base):
    __tablename__ = "user_scopes"

    id = Column(
        BigInteger,
        primary_key=True,
        autoincrement=True,
    )

    user_id = Column(
        BigInteger,
        ForeignKey("users.id"),
        nullable=False,
    )

    boarding_house_id = Column(
        BigInteger,
        ForeignKey("boarding_houses.id"),
        nullable=True,
    )

    room_id = Column(
        BigInteger,
        ForeignKey("rooms.id"),
        nullable=True,
    )
