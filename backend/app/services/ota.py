"""Durable OTA jobs and private, device-bound firmware releases."""
import hashlib
import hmac
import json
import logging
import re
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.parse import urlsplit
from uuid import uuid4

from cryptography.exceptions import InvalidSignature, UnsupportedAlgorithm
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding, rsa
from fastapi import HTTPException

from app.db import device_storage as storage

logger = logging.getLogger("iot_full")
MAX_IMAGE_BYTES = 1024 * 1024
STATUS_TOPIC = "iot/devices/+/ota/status"
DEVICE_PATTERN = r"[A-Za-z0-9_-]{1,32}"
VERSION_PATTERN = r"[A-Za-z0-9._-]{1,64}"
STATUS_TOPIC_RE = re.compile(rf"iot/devices/({DEVICE_PATTERN})/ota/status")
BOOT_RE = re.compile(r"[a-f0-9]{16}")
ID_RE = re.compile(r"[a-f0-9]{32}")
ACTIVE = ("queued", "pending", "downloading", "installing")
JOB_FIELDS = ("job_id, device_id, firmware_id, target_version, firmware_version, status, progress, "
              "error_code, requested_at, deadline_at, finished_at")
RELEASE_FIELDS = "firmware_id, device_id, version, board_model, hardware_version, size_bytes, sha256, created_at"
COMMAND_TTL = 60
JOB_TTL = 300


def utc_now():
    return datetime.now(timezone.utc).replace(tzinfo=None, microsecond=0)


def validate_status(topic, payload):
    if not isinstance(topic, str) or not isinstance(payload, bytes) or len(payload) > 768:
        return None
    match = STATUS_TOPIC_RE.fullmatch(topic)
    if not match:
        return None
    try:
        data = json.loads(payload)
    except (ValueError, RecursionError):
        return None
    if not isinstance(data, dict) or set(data) != {
        "device_id", "job_id", "boot_id", "target_version", "firmware_version", "status", "progress", "error"
    } or data["device_id"] != match[1]:
        return None
    for key, pattern in (("job_id", ID_RE), ("boot_id", BOOT_RE),
                         ("target_version", VERSION_PATTERN), ("firmware_version", VERSION_PATTERN)):
        if not isinstance(data[key], str) or not re.fullmatch(pattern, data[key]):
            return None
    state, progress, error = data["status"], data["progress"], data["error"]
    if state not in ("downloading", "installing", "booted", "failed") or type(progress) is not int:
        return None
    if not 0 <= progress <= 100 or (state == "downloading" and progress >= 100):
        return None
    if state == "failed":
        if not isinstance(error, str) or not re.fullmatch(r"[a-z0-9_]{1,64}", error):
            return None
    elif error is not None or (state in ("installing", "booted") and progress != 100):
        return None
    return data


class OtaController:
    def __init__(self, mqtt, public_origin, public_key_path, secret):
        self.mqtt = mqtt
        self.origin = public_origin
        self.secret = secret.encode()
        self.public_key = None
        if public_origin is None and public_key_path is None:
            return
        if not public_origin or not public_key_path:
            raise ValueError("Cần cấu hình cả IOT_OTA_PUBLIC_ORIGIN và IOT_OTA_PUBLIC_KEY.")
        url = urlsplit(public_origin)
        labels = url.netloc.split(".")
        if (url.scheme != "https" or len(labels) < 2 or not re.search(r"[A-Za-z]", url.netloc)
                or any(not re.fullmatch(r"[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?", label) for label in labels)
                or url.path not in ("", "/") or url.query or url.fragment or len(url.netloc) > 253):
            raise ValueError("IOT_OTA_PUBLIC_ORIGIN phải là HTTPS hostname, dùng cổng 443.")
        self.origin = "https://" + url.netloc
        try:
            key = serialization.load_pem_public_key(Path(public_key_path).read_bytes())
        except (OSError, ValueError, UnsupportedAlgorithm):
            raise ValueError("IOT_OTA_PUBLIC_KEY phải trỏ tới file PEM khóa công khai.") from None
        if not isinstance(key, rsa.RSAPublicKey) or key.key_size != 2048:
            raise ValueError("IOT_OTA_PUBLIC_KEY phải là khóa RSA 2048 bit.")
        self.public_key = key

    @property
    def enabled(self):
        return self.public_key is not None

    def ensure_enabled(self):
        if not self.enabled:
            raise HTTPException(503, "Backend chưa cấu hình cập nhật firmware.")

    def check_schema(self):
        if self.enabled:
            with storage.session() as cursor:
                cursor.execute("SELECT version FROM schema_migrations WHERE version = '20261120_ota'")
                if not cursor.fetchone():
                    raise RuntimeError("Thiếu migration 20261120_ota. Xem database/README.md.")
                cursor.execute("SELECT firmware_id, image FROM firmware_releases LIMIT 0")
                cursor.execute("SELECT job_id, deadline_at FROM ota_jobs LIMIT 0")

    def verify_image(self, image):
        if (not 260 < len(image) <= MAX_IMAGE_BYTES or image[0] != 0xe9 or
                int.from_bytes(image[-4:], "little") != 256):
            raise HTTPException(422, "Cần file .bin ESP8266 đã ký RSA 2048.")
        try:
            self.public_key.verify(image[-260:-4], image[:-260], padding.PKCS1v15(), hashes.SHA256())
        except InvalidSignature:
            raise HTTPException(422, "Chữ ký firmware không hợp lệ.") from None

    def add_release(self, device_id, version, image, user):
        self.verify_image(image)
        firmware_id = uuid4().hex
        with storage.session() as cursor:
            device = storage.allowed_device(cursor, user, device_id, lock=True)
            if device["device_id"] != device_id:
                raise HTTPException(404, "Mã node phải khớp với mã MQTT.")
            if device["lifecycle_status"] == "decommissioned":
                raise HTTPException(409, "Node đã ngừng sử dụng.")
            cursor.execute("SELECT 1 FROM firmware_releases WHERE device_id = %s AND version = %s",
                           (device_id, version))
            if cursor.fetchone():
                raise HTTPException(409, "Phiên bản này đã được tải lên cho node.")
            cursor.execute(
                "INSERT INTO firmware_releases (firmware_id, device_id, version, board_model, hardware_version, "
                "size_bytes, sha256, image) VALUES (%s,%s,%s,%s,%s,%s,%s,%s)",
                (firmware_id, device_id, version, device["board_model"], device["hardware_version"],
                 len(image), hashlib.sha256(image).hexdigest(), image))
            storage.audit(cursor, user["user_id"], device["room_id"], "OTA_UPLOAD", device_id,
                          {"firmware_id": firmware_id, "version": version})
            cursor.execute(f"SELECT {RELEASE_FIELDS} FROM firmware_releases WHERE firmware_id = %s", (firmware_id,))
            return storage.public_row(cursor.fetchone())

    def list_releases(self, device_id, user):
        with storage.session() as cursor:
            storage.allowed_device(cursor, user, device_id)
            cursor.execute(f"SELECT {RELEASE_FIELDS} FROM firmware_releases WHERE device_id = %s "
                           "ORDER BY created_at DESC, firmware_id DESC LIMIT 100", (device_id,))
            return [storage.public_row(row) for row in cursor.fetchall()]

    def latest_job(self, device_id, user):
        with storage.session() as cursor:
            storage.allowed_device(cursor, user, device_id)
            cursor.execute(f"SELECT {JOB_FIELDS} FROM ota_jobs WHERE device_id = %s "
                           "ORDER BY job_seq DESC LIMIT 1", (device_id,))
            row = cursor.fetchone()
            return storage.public_row(row) if row else None

    def get_job(self, job_id, user):
        with storage.session() as cursor:
            cursor.execute(f"SELECT {JOB_FIELDS} FROM ota_jobs WHERE job_id = %s", (job_id,))
            row = cursor.fetchone()
            if not row:
                raise HTTPException(404, "Không tìm thấy yêu cầu cập nhật.")
            storage.allowed_device(cursor, user, row["device_id"])
            return storage.public_row(row)

    def create_job(self, device_id, firmware_id, user):
        now, job_id = utc_now(), uuid4().hex
        with storage.session() as cursor:
            device = storage.allowed_device(cursor, user, device_id, control=True, lock=True)
            if device["device_id"] != device_id:
                raise HTTPException(404, "Mã node phải khớp với mã MQTT.")
            cursor.execute("SELECT 1 FROM ota_jobs WHERE device_id = %s "
                           "AND status IN ('queued','pending','downloading','installing') AND deadline_at > %s",
                           (device_id, now))
            if cursor.fetchone():
                raise HTTPException(409, "Node đã có một yêu cầu cập nhật đang chạy.")
            cursor.execute(f"SELECT {RELEASE_FIELDS} FROM firmware_releases WHERE firmware_id = %s AND device_id = %s",
                           (firmware_id, device_id))
            release = cursor.fetchone()
            if not release:
                raise HTTPException(404, "Không tìm thấy firmware của node này.")
            if any(release[key] != device[key] for key in ("board_model", "hardware_version")):
                raise HTTPException(409, "Thông tin phần cứng đã đổi từ khi tải file lên.")
            cursor.execute("SELECT raw_payload, created_at, timestamp FROM history "
                           "WHERE device_id = %s AND room_id <=> %s "
                           "ORDER BY timestamp DESC, id DESC LIMIT 1", (device_id, device["room_id"]))
            row = cursor.fetchone()
            if not row or not all(0 <= (now - row[key]).total_seconds() <= storage.ONLINE_WINDOW_S
                                  for key in ("created_at", "timestamp")):
                raise HTTPException(409, "Node chưa online hoặc telemetry đã cũ.")
            data = json.loads(row["raw_payload"] or "{}")
            if data.get("backfill") or data.get("ota_supported") is not True or not data.get("firmware_version"):
                raise HTTPException(409, "Firmware của node chưa báo hỗ trợ OTA.")
            if data.get("system_state") == "alarm" or (data.get("buzzer_test") or {}).get("active"):
                raise HTTPException(409, "Node đang báo động hoặc thử còi.")
            if data["firmware_version"] == release["version"]:
                raise HTTPException(409, "Node đang chạy phiên bản này.")
            cursor.execute(
                "INSERT INTO ota_jobs (job_id, device_id, firmware_id, requested_by, start_boot_id, expires_uptime_s, "
                "target_version, firmware_version, status, requested_at, deadline_at) "
                "VALUES (%s,%s,%s,%s,%s,%s,%s,%s,'queued',%s,%s)",
                (job_id, device_id, firmware_id, user["user_id"], data["boot_id"], data["uptime_s"] + COMMAND_TTL,
                 release["version"], data["firmware_version"], now, now + timedelta(seconds=JOB_TTL)))
            storage.audit(cursor, user["user_id"], device["room_id"], "OTA_REQUEST", device_id,
                          {"job_id": job_id, "firmware_id": firmware_id})
        return self.get_job(job_id, user)

    def token(self, job_id):
        return hmac.new(self.secret, ("ota-download:v1:" + job_id).encode(), hashlib.sha256).hexdigest()

    def download_image(self, job_id, token):
        if not re.fullmatch(r"[a-f0-9]{64}", token) or not hmac.compare_digest(token, self.token(job_id)):
            raise HTTPException(404, "Không tìm thấy file cập nhật.")
        with storage.session() as cursor:
            cursor.execute(
                "SELECT f.image FROM ota_jobs j JOIN firmware_releases f ON f.firmware_id = j.firmware_id "
                "AND f.device_id = j.device_id JOIN devices d ON d.device_id = j.device_id "
                "WHERE j.job_id = %s AND j.deadline_at > %s AND j.status IN ('pending','downloading') "
                "AND d.lifecycle_status = 'active' AND d.credential_status = 'active' "
                "AND d.mqtt_sync_status NOT IN ('pending','failed')", (job_id, utc_now()))
            row = cursor.fetchone()
            if not row:
                raise HTTPException(404, "Không tìm thấy file cập nhật.")
            return row["image"]

    def observe(self, message):
        if message.retain:
            return
        data = validate_status(message.topic, message.payload)
        if not data:
            return
        with storage.session() as cursor:
            cursor.execute("SELECT device_id, status, deadline_at, start_boot_id, target_version, firmware_version, "
                           "progress FROM ota_jobs WHERE job_id = %s FOR UPDATE", (data["job_id"],))
            job = cursor.fetchone()
            now = utc_now()
            if (not job or job["status"] not in ACTIVE[1:] or job["deadline_at"] <= now or
                    job["device_id"] != data["device_id"] or job["target_version"] != data["target_version"]):
                return
            state = data["status"]
            same_boot = data["boot_id"] == job["start_boot_id"]
            if state == "booted":
                if same_boot or data["firmware_version"] != job["target_version"]:
                    return
                state = "succeeded"
            elif state == "failed":
                if not same_boot and data["error"] != "version_mismatch":
                    return
            elif (not same_boot or data["firmware_version"] != job["firmware_version"] or
                  (job["status"] == "installing" and state == "downloading")):
                return
            progress = max(job["progress"], data["progress"])
            cursor.execute("UPDATE ota_jobs SET status = %s, firmware_version = %s, progress = %s, error_code = %s, "
                           "finished_at = %s WHERE job_id = %s",
                           (state, data["firmware_version"], progress, data["error"],
                            now if state in ("succeeded", "failed") else None, data["job_id"]))

    def tick(self, mqtt_ready):
        if not self.enabled:
            return
        now = utc_now()
        with storage.session() as cursor:
            cursor.execute("UPDATE ota_jobs SET status = 'timeout', error_code = 'timeout', finished_at = %s "
                           "WHERE status IN ('queued','pending','downloading','installing') AND deadline_at <= %s",
                           (now, now))
            cursor.execute("UPDATE ota_jobs SET status = 'failed', error_code = 'dispatch_expired', finished_at = %s "
                           "WHERE status = 'queued' AND requested_at <= %s",
                           (now, now - timedelta(seconds=COMMAND_TTL - storage.ONLINE_WINDOW_S)))
            if not mqtt_ready:
                return
            cursor.execute(
                "SELECT j.job_id, j.device_id, j.start_boot_id, j.expires_uptime_s, j.target_version, "
                "f.size_bytes, f.sha256, d.lifecycle_status, d.credential_status, d.mqtt_sync_status "
                "FROM ota_jobs j JOIN firmware_releases f ON f.firmware_id = j.firmware_id "
                "JOIN devices d ON d.device_id = j.device_id WHERE j.status = 'queued' "
                "ORDER BY j.job_seq LIMIT 1")
            job = cursor.fetchone()
            if not job:
                return
            if (job["lifecycle_status"] != "active" or job["credential_status"] != "active" or
                    job["mqtt_sync_status"] in ("pending", "failed")):
                cursor.execute("UPDATE ota_jobs SET status = 'failed', error_code = 'device_unavailable', "
                               "finished_at = %s WHERE job_id = %s AND status = 'queued'", (now, job["job_id"]))
                return
            cursor.execute("UPDATE ota_jobs SET status = 'pending' WHERE job_id = %s AND status = 'queued'",
                           (job["job_id"],))
            if cursor.rowcount != 1:
                return
        job_id = job["job_id"]
        command = {"job_id": job_id, "boot_id": job["start_boot_id"], "expires_uptime_s": job["expires_uptime_s"],
                   "target_version": job["target_version"], "size_bytes": job["size_bytes"], "sha256": job["sha256"],
                   "url": self.origin + "/api/ota/download/" + job_id + "?token=" + self.token(job_id)}
        try:
            info = self.mqtt.publish(f"iot/devices/{job['device_id']}/ota/start",
                                     json.dumps(command, separators=(",", ":")), qos=1, retain=False)
            if info.rc != 0:
                logger.warning("OTA MQTT delivery uncertain, awaiting device or timeout")
        except (OSError, RuntimeError, ValueError):
            logger.warning("OTA MQTT publish interrupted, awaiting device or timeout")
