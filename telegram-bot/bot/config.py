"""Đọc cấu hình từ biến môi trường, bổ sung bằng file .env cạnh thư mục bot."""
import os
from dataclasses import dataclass
from pathlib import Path

ENV_FILE = Path(__file__).resolve().parent.parent / ".env"


class ConfigError(Exception):
    pass


@dataclass(frozen=True)
class Config:
    telegram_token: str
    be_base_url: str
    secret_key: str
    poll_seconds: int = 3
    remind_seconds: int = 10
    db_path: str = "bot.db"


def _read_env_file(path: Path) -> dict[str, str]:
    values: dict[str, str] = {}
    if not path.exists():
        return values
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.split("#", 1)[0].strip() if not line.strip().startswith("#") else ""
        if "=" in line:
            key, value = line.split("=", 1)
            values[key.strip()] = value.strip()
    return values


def load(path: Path = ENV_FILE) -> Config:
    env = {**_read_env_file(path), **{k: v for k, v in os.environ.items() if v}}
    env.setdefault("TELEGRAM_BOT_TOKEN", env.get("BOT_TOKEN", ""))  # cho phép tên ngắn BOT_TOKEN
    missing = [k for k in ("TELEGRAM_BOT_TOKEN", "BE_BASE_URL", "BOT_SECRET_KEY") if not env.get(k)]
    if missing:
        raise ConfigError("Thiếu cấu hình trong telegram-bot/.env: " + ", ".join(missing))
    return Config(
        telegram_token=env["TELEGRAM_BOT_TOKEN"],
        be_base_url=env["BE_BASE_URL"].rstrip("/"),
        secret_key=env["BOT_SECRET_KEY"],
        poll_seconds=int(env.get("POLL_SECONDS", 3)),
        remind_seconds=int(env.get("REMIND_SECONDS", 10)),
        db_path=env.get("DB_PATH", "bot.db"),
    )
