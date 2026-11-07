from sqlalchemy import Column, BigInteger, String, Text, ForeignKey
from app.db.session import Base


class BoardingHouse(Base):
    __tablename__ = "boarding_houses"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    name = Column(String(255), nullable=False)
    address = Column(Text, nullable=True)
    landlord_id = Column(
        BigInteger,
        ForeignKey("users.id"),
        nullable=False,
    )