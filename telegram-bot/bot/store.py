"""Lưu liên kết chat ↔ tài khoản và các sự cố đã báo (SQLite). Token chỉ giữ trong bộ nhớ."""
import sqlite3
from dataclasses import dataclass


@dataclass
class Link:
    chat_id: int
    username: str
    password_enc: str
    user_id: str
    display_name: str
    role: str
    status: str  # active | needs_login


@dataclass
class Notice:
    chat_id: int
    incident_id: str
    phase: str  # open | acknowledged | recovered | closed
    message_id: int | None
    last_sent_at: float


class Store:
    def __init__(self, path: str):
        self.db = sqlite3.connect(path, check_same_thread=False)
        self.db.executescript(
            """
            CREATE TABLE IF NOT EXISTS links (
                chat_id INTEGER PRIMARY KEY, username TEXT NOT NULL, password_enc TEXT NOT NULL,
                user_id TEXT NOT NULL, display_name TEXT NOT NULL, role TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'active',
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
            CREATE TABLE IF NOT EXISTS notices (
                chat_id INTEGER NOT NULL, incident_id TEXT NOT NULL, phase TEXT NOT NULL,
                message_id INTEGER, last_sent_at REAL NOT NULL,
                PRIMARY KEY (chat_id, incident_id));
            CREATE TABLE IF NOT EXISTS device_alerts (
                chat_id INTEGER NOT NULL, alert_key TEXT NOT NULL, since REAL NOT NULL,
                notified INTEGER NOT NULL, PRIMARY KEY (chat_id, alert_key));
            """
        )
        self.db.commit()

    def save_link(self, link: Link) -> None:
        self.db.execute(
            "INSERT INTO links (chat_id, username, password_enc, user_id, display_name, role, status) "
            "VALUES (?,?,?,?,?,?,?) ON CONFLICT(chat_id) DO UPDATE SET username=excluded.username, "
            "password_enc=excluded.password_enc, user_id=excluded.user_id, "
            "display_name=excluded.display_name, role=excluded.role, status=excluded.status",
            (link.chat_id, link.username, link.password_enc, link.user_id,
             link.display_name, link.role, link.status),
        )
        self.db.commit()

    def get_link(self, chat_id: int) -> Link | None:
        row = self.db.execute(
            "SELECT chat_id, username, password_enc, user_id, display_name, role, status "
            "FROM links WHERE chat_id = ?", (chat_id,)).fetchone()
        return Link(*row) if row else None

    def active_links(self) -> list[Link]:
        rows = self.db.execute(
            "SELECT chat_id, username, password_enc, user_id, display_name, role, status "
            "FROM links WHERE status = 'active'").fetchall()
        return [Link(*r) for r in rows]

    def set_link_status(self, chat_id: int, status: str) -> None:
        self.db.execute("UPDATE links SET status = ? WHERE chat_id = ?", (status, chat_id))
        self.db.commit()

    def delete_link(self, chat_id: int) -> None:
        self.db.execute("DELETE FROM links WHERE chat_id = ?", (chat_id,))
        self.db.execute("DELETE FROM notices WHERE chat_id = ?", (chat_id,))
        self.db.execute("DELETE FROM device_alerts WHERE chat_id = ?", (chat_id,))
        self.db.commit()

    def get_notice(self, chat_id: int, incident_id: str) -> Notice | None:
        row = self.db.execute(
            "SELECT chat_id, incident_id, phase, message_id, last_sent_at FROM notices "
            "WHERE chat_id = ? AND incident_id = ?", (chat_id, incident_id)).fetchone()
        return Notice(*row) if row else None

    def save_notice(self, notice: Notice) -> None:
        self.db.execute(
            "INSERT INTO notices (chat_id, incident_id, phase, message_id, last_sent_at) "
            "VALUES (?,?,?,?,?) ON CONFLICT(chat_id, incident_id) DO UPDATE SET "
            "phase=excluded.phase, message_id=excluded.message_id, last_sent_at=excluded.last_sent_at",
            (notice.chat_id, notice.incident_id, notice.phase, notice.message_id, notice.last_sent_at),
        )
        self.db.commit()

    def notices_for(self, chat_id: int) -> list[Notice]:
        rows = self.db.execute(
            "SELECT chat_id, incident_id, phase, message_id, last_sent_at FROM notices "
            "WHERE chat_id = ?", (chat_id,)).fetchall()
        return [Notice(*r) for r in rows]

    def delete_notice(self, chat_id: int, incident_id: str) -> None:
        self.db.execute("DELETE FROM notices WHERE chat_id = ? AND incident_id = ?",
                        (chat_id, incident_id))
        self.db.commit()

    # Trạng thái báo mất kết nối / lỗi cảm biến của từng chat (xem bot/monitor.py).
    def get_alerts(self, chat_id: int) -> dict[str, tuple[float, bool]]:
        rows = self.db.execute("SELECT alert_key, since, notified FROM device_alerts WHERE chat_id = ?",
                               (chat_id,)).fetchall()
        return {key: (since, bool(notified)) for key, since, notified in rows}

    def replace_alerts(self, chat_id: int, alerts: dict[str, tuple[float, bool]]) -> None:
        self.db.execute("DELETE FROM device_alerts WHERE chat_id = ?", (chat_id,))
        self.db.executemany(
            "INSERT INTO device_alerts (chat_id, alert_key, since, notified) VALUES (?,?,?,?)",
            [(chat_id, key, since, int(notified)) for key, (since, notified) in alerts.items()])
        self.db.commit()
