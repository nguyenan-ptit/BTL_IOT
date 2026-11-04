import json
import sqlite3
from contextlib import closing
from datetime import datetime, timezone
from pathlib import Path

from validation import sensor_details


def initialize(path):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    with closing(sqlite3.connect(path, timeout=5)) as connection, connection:
        connection.execute("""
            CREATE TABLE IF NOT EXISTS sensor_telemetry_v2 (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                device_id TEXT NOT NULL,
                boot_id TEXT NOT NULL,
                seq INTEGER NOT NULL,
                received_at TEXT NOT NULL,
                payload TEXT NOT NULL,
                UNIQUE(device_id, boot_id, seq)
            )
        """)
        connection.execute("CREATE INDEX IF NOT EXISTS sensor_v2_device_id ON sensor_telemetry_v2(device_id, id)")


def save(path, data, received_at=None):
    received_at = received_at or datetime.now(timezone.utc).isoformat()
    with closing(sqlite3.connect(path, timeout=5)) as connection, connection:
        result = connection.execute("""
            INSERT OR IGNORE INTO sensor_telemetry_v2 (device_id, boot_id, seq, received_at, payload)
            VALUES (?, ?, ?, ?, ?)
        """, (data["device_id"], data["boot_id"], data["seq"], received_at,
              json.dumps(data, ensure_ascii=False, allow_nan=False)))
        return result.rowcount == 1


def read_latest(path, now=None):
    now = now or datetime.now(timezone.utc)
    with closing(sqlite3.connect(path, timeout=5)) as connection:
        connection.row_factory = sqlite3.Row
        rows = connection.execute("""
            SELECT id, received_at, payload FROM sensor_telemetry_v2
            WHERE id IN (SELECT MAX(id) FROM sensor_telemetry_v2 GROUP BY device_id)
            ORDER BY device_id
        """).fetchall()
    items = []
    for row in rows:
        data = json.loads(row["payload"])
        try:
            age = (now - datetime.fromisoformat(row["received_at"])).total_seconds()
            online = 0 <= age <= 20
        except (ValueError, TypeError):
            age, online = None, False
        configuration_pending = data["schema_version"] < 6
        display_state = "offline" if not online else data["system_state"]
        if online and configuration_pending and display_state != "alarm":
            display_state = "fault"
        items.append({
            "data": data, "online": online, "received_at": row["received_at"],
            "age_seconds": age, "display_state": display_state,
            "configuration_pending": configuration_pending,
            "sensors": sensor_details(data),
        })
    return items


def history(path, device_id, limit=20):
    with closing(sqlite3.connect(path, timeout=5)) as connection:
        connection.row_factory = sqlite3.Row
        rows = connection.execute("""
            SELECT received_at, payload FROM sensor_telemetry_v2
            WHERE device_id = ? ORDER BY id DESC LIMIT ?
        """, (device_id, limit)).fetchall()
    return [{"received_at": row["received_at"], "data": json.loads(row["payload"])} for row in rows]
