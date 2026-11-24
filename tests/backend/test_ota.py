import hashlib
import json
import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch
from urllib.parse import urlsplit

import jwt
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding, rsa
from fastapi.testclient import TestClient

from test_backend import ADMIN, OWNER, ROOT, SECRET, Database, application, storage

from app.integrations.mqtt.receiver import Receiver
from app.services.ota import OtaController


class OtaTests(unittest.TestCase):
    database_factory = Database

    @classmethod
    def setUpClass(cls):
        cls.directory = tempfile.TemporaryDirectory()
        cls.addClassCleanup(cls.directory.cleanup)
        key = cls.key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
        cls.key_path = Path(cls.directory.name) / "public.pem"
        cls.key_path.write_bytes(key.public_key().public_bytes(
            serialization.Encoding.PEM, serialization.PublicFormat.SubjectPublicKeyInfo))
        image = bytes([0xe9]) + b"OTA integration fixture" * 16
        signature = key.sign(image, padding.PKCS1v15(), hashes.SHA256())
        cls.signed = image + signature + len(signature).to_bytes(4, "little")

    def setUp(self):
        self.db = self.database_factory()
        self.addCleanup(self.db.connection.close)
        self.db.device()
        self.db.device("node02", room="A")
        self.enterContext(patch.object(storage, "session", self.db.session))
        self.enterContext(patch.dict("os.environ", {"JWT_SECRET": SECRET}))
        self.published = []
        self.ota = OtaController(SimpleNamespace(publish=self.publish), "https://firmware.example.com",
                                 self.key_path, SECRET)
        self.enterContext(patch.object(application.app.state, "ota", self.ota, create=True))
        self.enterContext(patch.object(application.app.state, "command_worker_ready", True, create=True))
        self.enterContext(patch.object(application.app.state, "receiver",
                                       SimpleNamespace(snapshot=lambda: {"connected": True, "ota_connected": True}),
                                       create=True))
        self.client = TestClient(application.app)
        self.addCleanup(self.client.close)
        self.headers = {}
        for user in (ADMIN, OWNER):
            token = jwt.encode({**user, "exp": datetime.now(timezone.utc) + timedelta(minutes=5)},
                               SECRET, algorithm="HS256")
            self.headers[user["role"]] = {"Authorization": "Bearer " + token, "X-IoT-Request": "1"}
        self.telemetry = json.loads((ROOT / "examples/telemetry-normal.json").read_text(encoding="utf-8"))
        self.telemetry.update(room="A", device_id="node01", firmware_version="v1.0.0", ota_supported=True)
        storage.save(self.telemetry)

    def publish(self, topic, payload, **options):
        command = json.loads(payload)
        job = self.db.row("SELECT status FROM ota_jobs WHERE job_id = %s", (command["job_id"],))
        self.assertEqual(job["status"], "pending")
        self.published.append((topic, command, options))
        return SimpleNamespace(rc=0)

    def manifest(self, device="node01", version="v1.0.1", image=None):
        digest = hashlib.sha256(self.signed if image is None else image).hexdigest()
        payload = f"iot-fota-manifest-v1\n{device}\n{version}\n{digest}".encode("ascii")
        signature = self.key.sign(payload, padding.PKCS1v15(), hashes.SHA256()).hex()
        return f"{device}:{version}:{digest}:{signature}"

    def upload(self, image=None, role="admin", device="node01", version="v1.0.1", manifest="auto"):
        headers = {**self.headers[role], "Content-Type": "application/octet-stream"}
        if manifest is not None:
            headers["X-IoT-Firmware-Manifest"] = self.manifest(image=image) if manifest == "auto" else manifest
        return self.client.post("/api/firmware", params={"device_id": device, "version": version},
                                content=self.signed if image is None else image, headers=headers)

    def start(self, firmware, device="node01"):
        return self.client.post(f"/api/devices/{device}/ota", headers=self.headers["admin"],
                                json={"firmware_id": firmware})

    def status(self, job, **fields):
        event = dict(device_id="node01", job_id=job, boot_id=self.telemetry["boot_id"],
                     target_version="v1.0.1", firmware_version="v1.0.0",
                     status="downloading", progress=10, error=None)
        event.update(fields)
        message = SimpleNamespace(topic="iot/devices/node01/ota/status", payload=json.dumps(event).encode(), retain=False)
        rx = Receiver({"mqtt_topic": "iot/devices/+/telemetry"})
        rx.on_ota_status = self.ota.observe
        rx.on_message(None, None, message)

    def overview(self):
        return self.client.get("/api/devices/node01/ota", headers=self.headers["admin"]).json()

    def test_signed_release_authorization_and_device_binding(self):
        invalid = self.signed[:8] + b"!" + self.signed[9:]
        self.assertEqual(self.upload(invalid).status_code, 422)
        self.assertEqual(self.upload(role="owner").status_code, 403)
        response = self.upload()
        self.assertEqual(response.status_code, 201, response.text)
        firmware = response.json()
        self.assertNotIn("image", firmware)
        self.assertEqual(self.upload().status_code, 409)
        self.assertEqual(self.start(firmware["firmware_id"], device="node02").status_code, 404)
        listing = self.client.get("/api/firmware?device_id=node01", headers=self.headers["admin"])
        self.assertEqual(listing.json()["items"], [firmware])

    def test_upload_rejects_missing_or_mismatched_manifest(self):
        valid = self.manifest()
        cases = [
            ({"manifest": None}, "Cần đúng một manifest"),
            ({"manifest": "invalid"}, "Định dạng manifest"),
            ({"manifest": valid.replace("node01:", "node02:", 1)}, "Chữ ký manifest"),
            ({"manifest": self.manifest(device="node02")}, "Firmware dành cho node02"),
            ({"version": "v1.0.1.0"}, "Firmware là bản v1.0.1"),
            ({"manifest": self.manifest(image=b"different binary")}, "mã SHA-256"),
        ]
        for arguments, message in cases:
            with self.subTest(message=message):
                response = self.upload(**arguments)
                self.assertEqual(response.status_code, 422)
                self.assertIn(message, response.json()["message"])
        listing = self.client.get("/api/firmware?device_id=node01", headers=self.headers["admin"])
        self.assertEqual(listing.json()["items"], [])

    def test_full_job_rejects_forged_or_stale_confirmation(self):
        firmware = self.upload().json()
        request = self.start(firmware["firmware_id"])
        self.assertEqual(request.status_code, 202, request.text)
        job_id = request.json()["job_id"]
        self.assertEqual(self.start(firmware["firmware_id"]).status_code, 409)
        self.assertEqual(self.overview()["job"]["status"], "queued")
        self.ota.tick(True)
        topic, command, options = self.published[0]
        self.assertEqual(topic, "iot/devices/node01/ota/start")
        self.assertEqual(options, {"qos": 1, "retain": False})
        self.assertEqual(command["sha256"], firmware["sha256"])
        url = urlsplit(command["url"])
        self.assertEqual(self.client.get(url.path + "?token=" + "0" * 64).status_code, 404)
        response = self.client.get(url.path + "?" + url.query)
        self.assertEqual(response.headers["content-length"], str(len(self.signed)))
        self.assertEqual(response.content, self.signed)
        self.status(job_id)
        self.status(job_id, status="installing", progress=100)
        self.status(job_id, progress=90)
        self.status(job_id, status="booted", progress=100, firmware_version="v1.0.1")
        self.status(job_id, status="booted", progress=100, boot_id="fedcba9876543210", device_id="node02")
        self.status(job_id, status="booted", progress=100, boot_id="fedcba9876543210")
        self.assertEqual(self.overview()["job"]["status"], "installing")
        self.status(job_id, status="booted", progress=100, firmware_version="v1.0.1", boot_id="fedcba9876543210")
        self.status(job_id, status="failed", error="connection_lost")
        result = self.client.get(f"/api/ota/jobs/{job_id}", headers=self.headers["admin"]).json()
        self.assertEqual((result["status"], result["firmware_version"], result["progress"]), ("succeeded", "v1.0.1", 100))
        self.assertEqual(self.client.get(url.path + "?" + url.query).status_code, 404)

    def test_boot_confirmation_can_follow_download_without_installing_status(self):
        release = self.upload().json()
        request = self.start(release["firmware_id"])
        self.assertEqual(request.status_code, 202, request.text)
        job_id = request.json()["job_id"]
        self.ota.tick(True)
        self.status(job_id)
        self.status(job_id, status="booted", progress=100,
                    firmware_version="v1.0.1", boot_id="fedcba9876543210")
        self.assertEqual(self.overview()["job"]["status"], "succeeded")

    def test_old_firmware_and_timeout(self):
        release = self.upload().json()
        storage.save({**self.telemetry, "ota_supported": False, "seq": self.telemetry["seq"] + 1})
        self.assertEqual(self.start(release["firmware_id"]).status_code, 409)
        storage.save({**self.telemetry, "seq": self.telemetry["seq"] + 2})
        request = self.start(release["firmware_id"])
        self.assertEqual(request.status_code, 202, request.text)
        with self.db.session() as cursor:
            cursor.execute("UPDATE ota_jobs SET deadline_at = '2020-01-01 00:00:00'")
        self.ota.tick(True)
        self.assertEqual(self.published, [])
        self.assertEqual(self.overview()["job"]["status"], "timeout")
