from sqlalchemy import Column, ForeignKey, Integer, String, Text

from app.db.session import Base


class BoardingHouse(Base):
    """Application name mapped onto the canonical ``houses`` table."""

    __tablename__ = "houses"

    id = Column("house_id", Integer, primary_key=True, autoincrement=True)
    landlord_id = Column("owner_id", Integer, ForeignKey("users.user_id"), nullable=False)
    name = Column("house_name", String(100), nullable=False)
    address = Column(Text, nullable=True)
