"""Compatibility entry point for the migration CLI."""
from scripts.migrate import main


if __name__ == "__main__":
    raise SystemExit(main())
