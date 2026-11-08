import json
import logging
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone

import pymysql
from fastapi import HTTPException

from app.core.legacy_auth import room_scope, verify_room_access
from app.services.telemetry_validation import sensor_details

logger = logging.getLogger("iot_full")
ONLINE_WINDOW_S = 20
_cfg = None


class StorageError(Exception):
    def __init__(self, message, errno=None):
        super().__init__(message)
        self.errno = errno


class DeviceNotRegistered(StorageError):
    pass


class DeviceNotAllowed(StorageError):
    pass


def configure(cfg):
    global _cfg
    missing = [key for key in ("host", "port", "user", "password", "database") if key not in cfg]
    if missing:
        raise ValueError("Thiếu cấu hình MySQL: " + ", ".join(missing))
    _cfg = dict(cfg)


@contextmanager
def session():
    """UTC transaction, with rollback on every exception including HTTP/domain errors."""
    if _cfg is None:
        raise StorageError("storage.configure() chưa được gọi")
    conn = None
    try:
        options = {"ssl_ca": _cfg["ssl_ca"], "ssl_verify_cert": True,
                   "ssl_verify_identity": True} if _cfg.get("ssl_ca") else {}
        conn = pymysql.connect(
            host=_cfg["host"], port=_cfg["port"], user=_cfg["user"], password=_cfg["password"],
            database=_cfg["database"], charset="utf8mb4", cursorclass=pymysql.cursors.DictCursor,
            connect_timeout=5, read_timeout=30, write_timeout=10, autocommit=False,
            init_command="SET time_zone = '+00:00', innodb_lock_wait_timeout = 5", **options)
        with conn.cursor() as cursor:
            yield cursor
        conn.commit()
    except BaseException as exc:
        if conn is not None:
            try:
                conn.rollback()
            except (pymysql.MySQLError, OSError):
                pass
        if isinstance(exc, (pymysql.MySQLError, OSError)):
            errno = exc.args[0] if exc.args and isinstance(exc.args[0], int) else None
            logger.error("MySQL error: %s (errno=%s)", type(exc).__name__, errno)
            raise StorageError(type(exc).__name__, errno) from None
        raise
    finally:
        if conn is not None:
            try:
                conn.close()
            except (pymysql.MySQLError, OSError):
                pass


def initialize(path=None):
    """Validate canonical database/init.sql; never recreate production tables."""
    with session() as cursor:
        cursor.execute(
            "SELECT index_name, GROUP_CONCAT(column_name ORDER BY seq_in_index) AS cols, "
            "MAX(sub_part) AS prefix_len FROM information_schema.statistics "
            "WHERE table_schema = DATABASE() AND table_name = 'history' AND non_unique = 0 "
            "GROUP BY index_name")
        indexes = cursor.fetchall()
        exact = [i for i in indexes if i["cols"] == "device_id,boot_id,seq"]
        if not exact or any(i["prefix_len"] is not None for i in exact):
            raise StorageError("history cần khóa duy nhất toàn bộ (device_id, boot_id, seq); xem database/README.md")
        cursor.execute("SELECT version FROM schema_migrations WHERE version = '20261106_01'")
        if not cursor.fetchone():
            raise StorageError("Thiếu migration 20261106_01; xem database/README.md")
        cursor.execute("SELECT mqtt_sync_status, mqtt_operation_id, mqtt_client_id FROM devices LIMIT 0")
        cursor.execute("SELECT operation_id, steps, password_digest FROM mqtt_operations LIMIT 0")
        cursor.execute("SELECT request_id, room_id, deadline_at, response_payload FROM device_commands LIMIT 0")


@contextmanager
def backend_guard():
    """One backend per database: recovery must not interrupt another live worker's commands."""
    with session() as cursor:
        cursor.execute("SELECT GET_LOCK(CONCAT('btl_backend_', LEFT(SHA2(DATABASE(), 256), 32)), 0) AS acquired")
        if cursor.fetchone()["acquired"] != 1:
            raise StorageError("Database đã có backend hoặc migration đang chạy; chỉ chạy một worker")
        try:
            yield cursor
        finally:
            cursor.execute("SELECT RELEASE_LOCK(CONCAT('btl_backend_', LEFT(SHA2(DATABASE(), 256), 32)))")


def _utc_naive(value=None):
    value = value or datetime.now(timezone.utc)
    if value.tzinfo is not None:
        value = value.astimezone(timezone.utc).replace(tzinfo=None)
    return value.replace(microsecond=0)


def _as_utc(value):
    return value.replace(tzinfo=timezone.utc) if value is not None else None


def public_row(row):
    result = dict(row)
    for key, value in result.items():
        if isinstance(value, datetime):
            result[key] = _as_utc(value).isoformat()
    return result


def _dict(value):
    return value if isinstance(value, dict) else {}


def audit(cursor, user_id, room_id, action, device_id, details, result="success"):
    cursor.execute(
        "INSERT INTO audit_logs (actor_user_id, room_id, action, target_type, target_id, result, details, created_at) "
        "VALUES (%s, %s, %s, 'device', %s, %s, %s, UTC_TIMESTAMP())",
        (user_id, room_id, action, device_id, result, json.dumps(details, ensure_ascii=False, allow_nan=False)))


def allowed_device(cursor, user, device_id, *, control=False, lock=False):
    cursor.execute("SELECT * FROM devices WHERE device_id = %s" + (" FOR UPDATE" if lock else ""), (device_id,))
    device = cursor.fetchone()
    if not device:
        raise HTTPException(404, "Không tìm thấy thiết bị.")
    if not verify_room_access(cursor, user["user_id"], user["role"], device["room_id"], manage=control):
        raise HTTPException(403, "Bạn không có quyền truy cập thiết bị/phòng này.")
    if control and (device["lifecycle_status"] != "active" or device["credential_status"] != "active"
                    or device.get("mqtt_sync_status") in ("pending", "failed")):
        raise HTTPException(409, "Thiết bị chưa ở trạng thái cho phép điều khiển.")
    return device


def save(data, received_at=None):
    """Only active/active; duplicates cannot refresh registry metadata or last_seen."""
    temperature, mq2, flame = (_dict(data.get(key)) for key in ("temperature", "mq2", "flame"))
    received = _utc_naive(received_at)
    with session() as cursor:
        cursor.execute("SELECT room_id, lifecycle_status, credential_status FROM devices "
                       "WHERE device_id = %s FOR UPDATE", (data["device_id"],))
        device = cursor.fetchone()
        if device is None:
            raise DeviceNotRegistered("DeviceNotRegistered", 1452)
        if device["lifecycle_status"] != "active" or device["credential_status"] != "active":
            raise DeviceNotAllowed("DeviceNotAllowed")
        cursor.execute(
            "INSERT INTO history (timestamp, device_id, room_id, room, boot_id, seq, system_state, "
            "temperature_c, mq2_adc, flame_do, raw_payload) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s) "
            "ON DUPLICATE KEY UPDATE id = id",
            (received, data["device_id"], device["room_id"], data["room"], data["boot_id"], data["seq"],
             data.get("system_state", "normal"), temperature.get("value_c"), mq2.get("adc_raw"),
             flame.get("do_level"), json.dumps(data, ensure_ascii=False, allow_nan=False)))
        if cursor.rowcount != 1:
            return False
        updates, params = ["last_seen_at = GREATEST(COALESCE(last_seen_at, %s), %s)"], [received, received]
        for key in ("hardware_version", "firmware_version"):
            if key in data:
                updates.append(key + " = %s")
                params.append(data[key])
        cursor.execute("UPDATE devices SET " + ", ".join(updates) + " WHERE device_id = %s",
                       (*params, data["device_id"]))
    return True


def read_latest(user, now=None):
    """Registry-first list. A move must not expose the previous room's telemetry."""
    now = now or datetime.now(timezone.utc)
    condition, params = room_scope(user, "d.room_id")
    with session() as cursor:
        cursor.execute(
            "SELECT d.*, h.timestamp AS received_at, h.raw_payload FROM devices d LEFT JOIN history h "
            "ON h.id = (SELECT MAX(h2.id) FROM history h2 WHERE h2.device_id = d.device_id "
            "AND h2.room_id <=> d.room_id) WHERE " + condition + " ORDER BY d.device_id", params)
        rows = cursor.fetchall()
    items = []
    for row in rows:
        data = json.loads(row["raw_payload"]) if row["raw_payload"] else None
        received = _as_utc(row["received_at"])
        age = (now - received).total_seconds() if received else None
        online = age is not None and 0 <= age <= ONLINE_WINDOW_S
        pending = bool(data and data.get("schema_version", 6) < 6)
        display = "offline" if not online else data.get("system_state", "normal")
        if online and pending and display != "alarm":
            display = "fault"
        registry = public_row({key: value for key, value in row.items() if key not in ("raw_payload", "received_at")})
        items.append({"device": registry, "device_id": row["device_id"], "room_id": row["room_id"],
                      "lifecycle_status": row["lifecycle_status"], "credential_status": row["credential_status"],
                      "data": data, "online": online, "connectivity": "online" if online else "offline",
                      "received_at": received.isoformat() if received else None, "age_seconds": age,
                      "display_state": display, "configuration_pending": pending,
                      "sensors": sensor_details(data) if data else []})
    return items


def history(device_id, limit=20, start=None, end=None, *, user):
    condition, scope_params = room_scope(user, "h.room_id")
    filters, params = ["h.device_id = %s", "(" + condition + ")"], [device_id, *scope_params]
    if start is not None:
        filters.append("h.timestamp >= %s")
        params.append(_utc_naive(start))
    if end is not None:
        filters.append("h.timestamp <= %s")
        params.append(_utc_naive(end))
    with session() as cursor:
        cursor.execute("SELECT h.timestamp, h.room_id, h.raw_payload FROM history h WHERE " +
                       " AND ".join(filters) + " ORDER BY h.id DESC LIMIT %s", (*params, limit))
        rows = cursor.fetchall()
    return [{"received_at": _as_utc(row["timestamp"]).isoformat(), "room_id": row["room_id"],
             "data": json.loads(row["raw_payload"])} for row in rows]


def create_command(command, item, command_type, wire, user, timeout):
    now = datetime.now(timezone.utc)
    with session() as cursor:
        device = allowed_device(cursor, user, item["data"]["device_id"], control=True, lock=True)
        if device["room_id"] != item["room_id"]:
            raise HTTPException(409, "Thiết bị đã chuyển phòng; tải lại dữ liệu.")
        command["room_id"] = device["room_id"]
        command["device_id"] = device["device_id"]
        command["persisted_status"] = command["status"] if wire is None else "queued"
        cursor.execute(
            "INSERT INTO device_commands (request_id, device_id, room_id, requested_by, command_type, "
            "request_payload, status, expected_boot_id, expected_revision, expected_command_seq, "
            "requested_at, deadline_at, finished_at) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)",
            (command["request_id"], device["device_id"], device["room_id"], user["user_id"], command_type,
             json.dumps({"sent": False, "command": wire, "noop": wire is None}, allow_nan=False),
             command["persisted_status"], command["boot_id"], command.get("expected_revision"),
             command.get("expected_seq"), _utc_naive(now), _utc_naive(now + timedelta(seconds=timeout)),
             _utc_naive(now) if wire is None else None))
        audit(cursor, user["user_id"], device["room_id"], "COMMAND_CREATED", device["device_id"],
              {"request_id": command["request_id"], "command_type": command_type})


def dispatch_command(command, user, publish):
    """Commit a queued record first; serialize actual dispatch with lifecycle/room updates."""
    error = None
    with session() as cursor:
        try:
            device = allowed_device(cursor, user, command["device_id"], control=True, lock=True)
            if device["room_id"] != command["room_id"]:
                raise HTTPException(409, "Thiết bị đã chuyển phòng; lệnh đã hủy.")
            cursor.execute("SELECT status FROM device_commands WHERE request_id = %s FOR UPDATE",
                           (command["request_id"],))
            row = cursor.fetchone()
            if not row or row["status"] != "queued":
                raise HTTPException(409, "Lệnh không còn chờ gửi.")
            publish()
        except (HTTPException, OSError, RuntimeError, ValueError) as exc:
            error = exc if isinstance(exc, HTTPException) else HTTPException(503, "Không xác nhận được việc gửi MQTT.")
            rejected = isinstance(exc, HTTPException)
            cursor.execute("UPDATE device_commands SET status = %s, "
                           "finished_at = CASE WHEN %s THEN UTC_TIMESTAMP() ELSE NULL END, "
                           "request_payload = JSON_SET(request_payload, '$.sent', %s), error_message = %s "
                           "WHERE request_id = %s",
                           ("failed" if rejected else "unconfirmed", rejected, False if rejected else None,
                            "dispatch_rejected" if rejected else "publish_unconfirmed", command["request_id"]))
        else:
            cursor.execute("UPDATE device_commands SET status = 'pending', "
                           "request_payload = JSON_SET(request_payload, '$.sent', true) WHERE request_id = %s",
                           (command["request_id"],))
    if error is not None:
        command["status"] = "failed" if rejected else "unconfirmed"
        command["message"] = "Chưa xác nhận được việc gửi; chờ telemetry của ESP trước khi thử lại."
        command["persisted_status"] = command["status"]
        raise error
    command["persisted_status"] = "pending"


def update_command(command, data=None):
    if command["status"] == command.get("persisted_status"):
        return
    terminal = command["status"] not in ("pending", "running", "queued", "unconfirmed")
    evidence = None
    if data and command["status"] in ("applied", "running", "completed", "stopped", "blocked", "interrupted"):
        evidence = {key: data[key] for key in ("boot_id", "seq", "remote_config", "buzzer_test") if key in data}
    with session() as cursor:
        cursor.execute("SELECT room_id FROM devices WHERE device_id = %s FOR UPDATE", (command["device_id"],))
        device = cursor.fetchone()
        if not device or device["room_id"] != command["room_id"]:
            command.update(status="interrupted", message="Thiết bị đã chuyển phòng; kết quả lệnh chưa được xác nhận.")
            evidence, terminal = None, True
        cursor.execute(
            "UPDATE device_commands SET status = %s, response_payload = %s, "
            "acknowledged_at = CASE WHEN %s THEN COALESCE(acknowledged_at, UTC_TIMESTAMP()) ELSE acknowledged_at END, "
            "finished_at = CASE WHEN %s THEN UTC_TIMESTAMP() ELSE NULL END, error_message = %s "
            "WHERE request_id = %s",
            (command["status"], json.dumps(evidence, ensure_ascii=False, allow_nan=False) if evidence else None,
             command["status"] in ("applied", "running", "completed", "stopped", "blocked", "interrupted"),
             terminal, command["message"] if command["status"] in ("timeout", "superseded") else None,
             command["request_id"]))
    command["persisted_status"] = command["status"]


def recover_commands():
    """Single backend worker: never replay physical commands after a restart."""
    with session() as cursor:
        cursor.execute("UPDATE device_commands SET status = CASE WHEN deadline_at <= UTC_TIMESTAMP() "
                       "THEN 'timeout' ELSE 'interrupted' END, finished_at = UTC_TIMESTAMP(), "
                       "error_message = 'backend_restarted; execution not confirmed' "
                       "WHERE status IN ('queued', 'pending', 'running', 'unconfirmed')")


def expire_commands():
    with session() as cursor:
        cursor.execute("UPDATE device_commands SET status = 'timeout', finished_at = UTC_TIMESTAMP(), "
                       "error_message = 'execution not confirmed before deadline' "
                       "WHERE status IN ('queued', 'pending', 'running', 'unconfirmed') "
                       "AND deadline_at <= UTC_TIMESTAMP()")


def command_history(device_id, limit, user):
    condition, params = room_scope(user, "c.room_id")
    with session() as cursor:
        cursor.execute("SELECT c.* FROM device_commands c WHERE c.device_id = %s AND (" + condition +
                       ") ORDER BY c.command_id DESC LIMIT %s", (device_id, *params, limit))
        rows = cursor.fetchall()
    items = []
    for row in rows:
        item = public_row(row)
        for key in ("request_payload", "response_payload"):
            item[key] = json.loads(item[key]) if item[key] else None
        items.append(item)
    return items
