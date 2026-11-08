"""Chạy bot: python run.py (cấu hình trong .env cạnh file này)."""
import logging
import sys

from bot.app import build
from bot.config import ConfigError, load


def main() -> None:
    # Terminal Windows mặc định không in được tiếng Việt.
    for stream in (sys.stdout, sys.stderr):
        stream.reconfigure(encoding="utf-8")
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    logging.getLogger("httpx").setLevel(logging.WARNING)  # tránh in URL có token bot
    logging.getLogger("apscheduler").setLevel(logging.WARNING)  # bỏ dòng log mỗi lần hỏi backend
    try:
        config = load()
    except ConfigError as error:
        print(error, file=sys.stderr)
        sys.exit(1)
    build(config).run_polling()


if __name__ == "__main__":
    main()
