
from sqlalchemy import Column, BigInteger, String, Boolean, DateTime

from app.db.session import Base


class User(Base):
    __tablename__ = "users"

    id = Column(BigInteger, primary_key=True, autoincrement=True)

    username = Column(
        String(100),
        nullable=False,
        unique=True,
    )

    password_hash = Column(
        String(255),
        nullable=False,
    )

    display_name = Column(
        String(150),
        nullable=False,
    )

    role = Column(
        String(20),
        nullable=False,
    )

    is_locked = Column(
        Boolean,
        nullable=False,
        default=False,
    )

    created_at = Column(
        DateTime,
        nullable=False,
    )
