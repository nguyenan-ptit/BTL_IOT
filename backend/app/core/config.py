from pathlib import Path

from pydantic import AliasChoices, Field, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict
from sqlalchemy.engine import URL


class Settings(BaseSettings):
    app_name: str = "Fire & Gas Monitoring API"
    app_env: str = "development"
    debug: bool = Field(default=False, validation_alias="APP_DEBUG")

    database_url: str | None = Field(default=None, validation_alias=AliasChoices("DATABASE_URL", "database_url"))
    mysql_host: str = Field(default="127.0.0.1", validation_alias="IOT_MYSQL_HOST")
    mysql_port: int = Field(default=3306, validation_alias="IOT_MYSQL_PORT")
    mysql_user: str = Field(default="iot_app", validation_alias="IOT_MYSQL_USER")
    mysql_password: str = Field(default="", validation_alias="IOT_MYSQL_PASSWORD")
    mysql_database: str = Field(default="iot_db", validation_alias="IOT_MYSQL_DATABASE")
    jwt_secret_key: str = Field(validation_alias=AliasChoices("JWT_SECRET", "JWT_SECRET_KEY", "jwt_secret_key"))
    access_token_expire_minutes: int = 30
    cors_origins: list[str] = ["http://localhost:5173", "http://127.0.0.1:5173"]

    model_config = SettingsConfigDict(
        env_file=str(Path(__file__).resolve().parents[3] / ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )

    @field_validator("jwt_secret_key")
    @classmethod
    def validate_jwt_secret(cls, value: str) -> str:
        if len(value) < 32:
            raise ValueError("JWT_SECRET must contain at least 32 characters")
        return value

    @field_validator("access_token_expire_minutes")
    @classmethod
    def validate_access_expiry(cls, value: int) -> int:
        if not 1 <= value <= 1440:
            raise ValueError("ACCESS_TOKEN_EXPIRE_MINUTES must be from 1 to 1440")
        return value

    @model_validator(mode="after")
    def configure_database_url(self):
        if self.database_url:
            return self
        if not self.mysql_password:
            raise ValueError("Set DATABASE_URL or IOT_MYSQL_PASSWORD")
        self.database_url = URL.create(
            "mysql+pymysql",
            username=self.mysql_user,
            password=self.mysql_password,
            host=self.mysql_host,
            port=self.mysql_port,
            database=self.mysql_database,
            query={"charset": "utf8mb4"},
        ).render_as_string(hide_password=False)
        return self


settings = Settings()
