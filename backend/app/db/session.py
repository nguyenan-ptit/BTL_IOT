
from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from app.core.config import settings


engine = create_engine(
    settings.sqlalchemy_url,
    pool_pre_ping=True,
    echo=settings.debug and settings.app_env.lower() not in ("production", "prod"),
    connect_args={"ssl": {"ca": settings.mysql_ssl_ca, "check_hostname": True}} if settings.mysql_ssl_ca else {},
)


SessionLocal = sessionmaker(
    bind=engine,
    autoflush=False,
    autocommit=False,
)


class Base(DeclarativeBase):
    pass


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
