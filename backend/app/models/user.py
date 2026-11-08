from datetime import datetime

from sqlalchemy import Column, DateTime, Integer, String, case
from sqlalchemy.ext.hybrid import hybrid_property

from app.db.session import Base


class User(Base):
    """ORM view of the canonical ``users`` table in database/init.sql."""

    __tablename__ = "users"

    id = Column("user_id", Integer, primary_key=True, autoincrement=True)
    username = Column(String(50), nullable=False, unique=True)
    password_hash = Column(String(255), nullable=False)
    display_name = Column("full_name", String(100), nullable=True)
    _role = Column("role", String(20), nullable=False, default="tenant")
    status = Column(String(20), nullable=False, default="active")
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)

    @hybrid_property
    def role(self):
        return "landlord" if self._role == "owner" else self._role

    @role.setter
    def role(self, value):
        self._role = "owner" if value == "landlord" else value

    @role.expression
    def role(cls):
        return case((cls._role == "owner", "landlord"), else_=cls._role)

    @hybrid_property
    def is_locked(self):
        return self.status != "active"

    @is_locked.setter
    def is_locked(self, value):
        self.status = "locked" if value else "active"

    @is_locked.expression
    def is_locked(cls):
        return cls.status != "active"
