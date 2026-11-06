import json
import logging
from contextlib import contextmanager
from datetime import datetime, timezone

import pymysql

from validation import sensor_details

logger = logging.getLogger("iot_full")
ONLINE_WINDOW_S = 20
_cfg = None


class StorageError(Exception):
    """Lỗi database. `errno` là mã lỗi MySQL nếu có (vd. 1452 = khóa ngoại: thiết bị chưa đăng ký)."""

    def __init__(self, message, errno=None):
        super().__init__(message)
        self.errno = errno


class DeviceNotRegistered(StorageError):
    """Khóa ngoại (MySQL 1452): device_id chưa có trong bảng devices. Không phải lỗi hạ tầng:
    receiver nên bỏ qua bản tin này, ghi last_error và tiếp tục nhận các node khác."""


class DeviceNotAllowed(StorageError):
    """Thiết bị CÓ trong bảng devices nhưng vòng đời/credential không cho phép ghi telemetry
    (đang bị khóa, đã ngừng sử dụng, hoặc credential đã thu hồi). Receiver nên bỏ qua bản tin."""


# Trạng thái vòng đời / credential KHÔNG được ghi dữ liệu vào history.
BLOCKED_LIFECYCLE = ("blocked", "decommissioned")
BLOCKED_CREDENTIAL = ("revoked",)


def configure(cfg):
    """Nhận khối mysql đã kiểm tra: host, port, user, password, database, (ssl_ca)."""
    global _cfg
    missing = [key for key in ("host", "port", "user", "password", "database") if key not in cfg]
    if missing:
        raise ValueError("Thiếu cấu hình MySQL: " + ", ".join(missing))
    _cfg = dict(cfg)


@contextmanager
def session():
    """Một kết nối cho mỗi lần gọi; commit khi thành công, rollback + StorageError khi lỗi."""
    if _cfg is None:
        raise RuntimeError("storage.configure() chưa được gọi")
    conn = None
    try:
        options = {"ssl_ca": _cfg["ssl_ca"]} if _cfg.get("ssl_ca") else {}
        conn = pymysql.connect(
            host=_cfg["host"], port=_cfg["port"], user=_cfg["user"], password=_cfg["password"],
            database=_cfg["database"], charset="utf8mb4", cursorclass=pymysql.cursors.DictCursor,
            connect_timeout=5, read_timeout=10, write_timeout=10, autocommit=False, **options)
        with conn.cursor() as cursor:
            yield cursor
        conn.commit()
    except (pymysql.MySQLError, OSError) as exc:
        if conn is not None:
            try:
                conn.rollback()
            except (pymysql.MySQLError, OSError):
                pass
        errno = exc.args[0] if exc.args and isinstance(exc.args[0], int) else None
        logger.error("MySQL error: %s (errno=%s)", type(exc).__name__, errno)  # không log thông điệp gốc
        if errno == 1452:
            raise DeviceNotRegistered(type(exc).__name__, errno) from None
        raise StorageError(type(exc).__name__, errno) from None
    finally:
        if conn is not None:
            try:
                conn.close()
            except (pymysql.MySQLError, OSError):
                pass


def initialize(path=None):
    """Chỉ KIỂM TRA schema; không tạo bảng. Schema chuẩn là database/init_db.sql (chạy thủ công).

    Từ chối chạy nếu bảng history chưa có khóa duy nhất (device_id, boot_id, seq) trên TOÀN BỘ
    device_id (không dùng tiền tố như device_id(30)).
    """
    with session() as cursor:
        cursor.execute(
            "SELECT index_name, "
            "GROUP_CONCAT(column_name ORDER BY seq_in_index) AS cols, "
            "MAX(sub_part) AS prefix_len "
            "FROM information_schema.statistics "
            "WHERE table_schema = DATABASE() AND table_name = 'history' AND non_unique = 0 "
            "GROUP BY index_name")
        indexes = cursor.fetchall()
    exact = [i for i in indexes if i["cols"] == "device_id,boot_id,seq"]
    if not exact:
        raise StorageError("Bảng history thiếu khóa duy nhất (device_id, boot_id, seq); "
                           "chạy database/init_db.sql hoặc migration")
    if any(i["prefix_len"] is not None for i in exact):
        raise StorageError("Khóa duy nhất của history đang dùng tiền tố cột (vd. device_id(30)); "
                           "phải dùng toàn bộ device_id")


def _utc_naive(value):
    value = value or datetime.now(timezone.utc)
    if value.tzinfo is not None:
        value = value.astimezone(timezone.utc).replace(tzinfo=None)
    return value.replace(microsecond=0)  # cột DATETIME không phần lẻ: cắt, không để MySQL làm tròn lên


def _as_utc(value):
    return value.replace(tzinfo=timezone.utc)


def _dict(value):
    return value if isinstance(value, dict) else {}


def save(data, received_at=None):
    """Lưu một mẫu. True = đã lưu; False = bản trùng. Lỗi database -> StorageError (không nuốt)."""
    temperature, mq2, flame = _dict(data.get("temperature")), _dict(data.get("mq2")), _dict(data.get("flame"))
    sql = """
        INSERT INTO history (`timestamp`, device_id, room_id, room, boot_id, seq, system_state,
                             temperature_c, mq2_adc, flame_do, raw_payload)
        VALUES (%s, %s, (SELECT room_id FROM devices WHERE device_id = %s), %s, %s, %s, %s, %s, %s, %s, %s)
        ON DUPLICATE KEY UPDATE id = id
    """
    params = (
        _utc_naive(received_at), data["device_id"], data["device_id"], data["room"], data["boot_id"], data["seq"],
        data.get("system_state", "normal"),
        temperature.get("value_c"),   # None khi cảm biến lỗi
        mq2.get("adc_raw"),           # None khi MQ-2 tắt
        flame.get("do_level"),        # mức DO thật (0/1); None khi chưa hợp lệ, KHÔNG phải cờ alarm
        json.dumps(data, ensure_ascii=False, allow_nan=False),
    )
    with session() as cursor:
        cursor.execute("SELECT lifecycle_status, credential_status FROM devices WHERE device_id = %s",
                       (data["device_id"],))
        device = cursor.fetchone()
        if device is None:
            raise DeviceNotRegistered("DeviceNotRegistered", 1452)
        if (device["lifecycle_status"] in BLOCKED_LIFECYCLE
                or device["credential_status"] in BLOCKED_CREDENTIAL):
            raise DeviceNotAllowed("DeviceNotAllowed")
        cursor.execute(sql, params)
        return cursor.rowcount == 1


def read_latest(now=None):
    """Mẫu mới nhất của từng thiết bị kèm trạng thái online theo thời điểm nhận."""
    now = now or datetime.now(timezone.utc)
    with session() as cursor:
        cursor.execute("""
            SELECT h.`timestamp`, h.raw_payload FROM history h
            INNER JOIN (SELECT device_id, MAX(id) AS max_id FROM history GROUP BY device_id) latest
                    ON h.id = latest.max_id
            ORDER BY h.device_id
        """)
        rows = cursor.fetchall()
    items = []
    for row in rows:
        data = json.loads(row["raw_payload"])
        received = _as_utc(row["timestamp"])
        age = (now - received).total_seconds()
        online = 0 <= age <= ONLINE_WINDOW_S
        configuration_pending = data.get("schema_version", 6) < 6
        display_state = "offline" if not online else data.get("system_state", "normal")
        if online and configuration_pending and display_state != "alarm":
            display_state = "fault"
        items.append({
            "data": data,
            "online": online,
            "received_at": received.isoformat(),
            "age_seconds": age,
            "display_state": display_state,
            "configuration_pending": configuration_pending,
            "sensors": sensor_details(data),
        })
    return items


def history(device_id, limit=20):
    with session() as cursor:
        cursor.execute(
            "SELECT `timestamp`, raw_payload FROM history WHERE device_id = %s ORDER BY id DESC LIMIT %s",
            (device_id, limit))
        rows = cursor.fetchall()
    return [{"received_at": _as_utc(row["timestamp"]).isoformat(), "data": json.loads(row["raw_payload"])}
            for row in rows]