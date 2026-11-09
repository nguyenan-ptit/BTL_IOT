from pathlib import Path

from pydantic import AliasChoices, Field, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict
from sqlalchemy.engine import URL


class Settings(BaseSettings):
    app_name: str = "Fire & Gas Monitoring API"
    app_env: str = "development"
    debug: bool = Field(default=False, validation_alias="APP_DEBUG")

    mysql_host: str = Field(default="127.0.0.1", validation_alias="IOT_MYSQL_HOST")
    mysql_port: int = Field(default=3306, validation_alias="IOT_MYSQL_PORT")
    mysql_user: str = Field(default="iot_app", validation_alias="IOT_MYSQL_USER")
    mysql_password: str = Field(default="", validation_alias="IOT_MYSQL_PASSWORD")
    mysql_database: str = Field(default="iot_db", validation_alias="IOT_MYSQL_DATABASE")
    mysql_ssl_ca: str | None = Field(default=None, validation_alias="IOT_MYSQL_SSL_CA")
    mqtt_host: str | None = Field(default=None, validation_alias="IOT_MQTT_HOST")
    mqtt_username: str = Field(default="", validation_alias="IOT_MQTT_USERNAME")
    mqtt_password: str = Field(default="", validation_alias="IOT_MQTT_PASSWORD")
    emqx_api_url: str | None = Field(default=None, validation_alias="IOT_EMQX_API_URL")
    emqx_api_key: str = Field(default="", validation_alias="IOT_EMQX_API_KEY")
    emqx_api_secret: str = Field(default="", validation_alias="IOT_EMQX_API_SECRET")
    emqx_deployment: str | None = Field(default=None, validation_alias="IOT_EMQX_DEPLOYMENT")
    emqx_policy_verified: bool | None = Field(default=None, validation_alias="IOT_EMQX_POLICY_VERIFIED")
    jwt_secret_key: str = Field(validation_alias=AliasChoices("JWT_SECRET", "JWT_SECRET_KEY", "jwt_secret_key"))
    access_token_expire_minutes: int = 30
    cors_origins: list[str] = ["http://localhost:5173", "http://127.0.0.1:5173", "https://frontend-iot-web-crm.vercel.app"]

    model_config = SettingsConfigDict(
        env_file=str(Path(__file__).resolve().parents[3] / ".env"),
        env_file_encoding="utf-8",
        env_ignore_empty=True,
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
    def validate_mysql(self):
        if not self.mysql_password:
            raise ValueError("Set IOT_MYSQL_PASSWORD")
        if not self.mysql_host.strip() or not self.mysql_user.strip() or not self.mysql_database.strip():
            raise ValueError("IOT_MYSQL_HOST, IOT_MYSQL_USER, and IOT_MYSQL_DATABASE must not be empty")
        if not 1 <= self.mysql_port <= 65535:
            raise ValueError("IOT_MYSQL_PORT must be from 1 to 65535")
        if self.mysql_ssl_ca is not None:
            ca = Path(self.mysql_ssl_ca)
            if not ca.is_absolute():
                ca = Path(__file__).resolve().parents[3] / ca
            if not ca.is_file():
                raise ValueError("IOT_MYSQL_SSL_CA must point to an existing CA file")
            self.mysql_ssl_ca = str(ca)
        return self

    @property
    def sqlalchemy_url(self) -> URL:
        return URL.create(
            "mysql+pymysql", username=self.mysql_user, password=self.mysql_password,
            host=self.mysql_host, port=self.mysql_port, database=self.mysql_database,
            query={"charset": "utf8mb4"},
        )

    @property
    def mysql_config(self) -> dict:
        return {"host": self.mysql_host, "port": self.mysql_port, "user": self.mysql_user,
                "password": self.mysql_password, "database": self.mysql_database,
                "ssl_ca": self.mysql_ssl_ca}


settings = Settings()
