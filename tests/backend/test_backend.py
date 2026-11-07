"""Isolated API/storage/controller tests. SQLite is a test adapter, not MySQL proof."""
import copy
import json
import os
from pathlib import Path
import re
import sqlite3
import sys
import threading
import unittest
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "backend"))
import app.main as application
import app.core.legacy_auth as auth
import app.core.lifespan as app_lifespan
import app.api.routes.devices as devices_api
import app.api.routes.device_runtime as device_runtime
import app.db.device_storage as storage
import app.integrations.emqx.admin as emqx_admin
import app.integrations.mqtt.buzzer_control as buzzer_control
import app.integrations.mqtt.receiver as receiver
import app.integrations.mqtt.remote_control as remote_control
import app.services.mqtt_lifecycle as mqtt_lifecycle
import app.services.telemetry_validation as telemetry_validation
import scripts.migrate as migrate
from fastapi import HTTPException
from fastapi.testclient import TestClient
import jwt

BuzzerController = buzzer_control.BuzzerController
Receiver = receiver.Receiver
RemoteController = remote_control.RemoteController
ThresholdUpdate = remote_control.ThresholdUpdate
validate_message = telemetry_validation.validate_message

SECRET = "isolated-test-secret-only-0123456789abcdef"
ADMIN = {"user_id": 1001, "role": "admin"}
OWNER = {"user_id": 1002, "role": "owner"}
TENANT = {"user_id": 1003, "role": "tenant"}
PASSWORD = "isolated-mqtt-test-password"
sqlite3.register_adapter(datetime, lambda value: value.isoformat(" "))
sqlite3.register_converter("TIMESTAMP", lambda value: datetime.fromisoformat(value.decode()))


class SqliteCursor:
    def __init__(self, connection):
        self.cursor = connection.cursor()

    def execute(self, sql, params=()):
        sql = sql.replace(" FOR UPDATE", "").replace("%s", "?").replace("<=>", "IS")
        sql = sql.replace("UTC_TIMESTAMP()", "utc_now()").replace("GREATEST(", "max(")
        sql = sql.replace("ON DUPLICATE KEY UPDATE id = id", "ON CONFLICT(device_id,boot_id,seq) DO NOTHING")
        self.cursor.execute(sql, params)
        return self

    @property
    def rowcount(self):
        return self.cursor.rowcount

    def fetchone(self):
        row = self.cursor.fetchone()
        return dict(row) if row is not None else None

    def fetchall(self):
        return [dict(row) for row in self.cursor.fetchall()]


class Database:
    def __init__(self):
        self.connection = sqlite3.connect(":memory:", detect_types=sqlite3.PARSE_DECLTYPES, check_same_thread=False)
        self.connection.row_factory = sqlite3.Row
        self.connection.create_function("utc_now", 0, lambda: datetime.now(timezone.utc).replace(tzinfo=None, microsecond=0).isoformat(" "))
        self.connection.execute("PRAGMA foreign_keys=ON")
        # Execute canonical table definitions through an explicit SQL dialect adapter.
        for name, definition in migrate.canonical_tables().items():
            definition = re.sub(r"--[^\n]*", "", definition)
            definition = re.sub(r"\b(?:BIGINT|INT)(?: UNSIGNED)? AUTO_INCREMENT PRIMARY KEY", "INTEGER PRIMARY KEY AUTOINCREMENT", definition)
            definition = re.sub(r"ENUM\([^)]*\)", "TEXT", definition)
            definition = definition.replace("DATETIME", "TIMESTAMP").replace(" ON UPDATE CURRENT_TIMESTAMP", "")
            definition = re.sub(r"^\s*INDEX [^\n]+,?\n", "\n", definition, flags=re.MULTILINE)
            definition = re.sub(r"UNIQUE KEY \w+", "UNIQUE", definition)
            definition = re.sub(r",\s*\) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;", ")", definition)
            definition = definition.replace(" ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;", "")
            self.connection.execute("CREATE TABLE " + name + " " + definition)
        for user_id, role, status in ((1001, "admin", "active"), (1002, "owner", "active"),
                                      (1003, "tenant", "active"), (1004, "owner", "active"), (1005, "admin", "locked")):
            self.connection.execute("INSERT INTO users(user_id,username,password_hash,role,status) VALUES(?,?,?,?,?)",
                                    (user_id, "u" + str(user_id), "test-only", role, status))
        self.connection.executemany("INSERT INTO houses(house_id,owner_id,house_name) VALUES(?,?,?)", [(1, 1002, "own"), (2, 1004, "other")])
        self.connection.executemany("INSERT INTO rooms(room_id,house_id,room_name) VALUES(?,?,?)", [("A", 1, "A"), ("A2", 1, "A2"), ("B", 2, "B")])
        self.connection.execute("INSERT INTO room_users(room_id,user_id,started_at) VALUES('A',1003,'2020-01-01 00:00:00')")
        self.connection.commit()

    @contextmanager
    def session(self):
        try:
            yield SqliteCursor(self.connection)
            self.connection.commit()
        except BaseException:
            self.connection.rollback()
            raise

    def row(self, sql, params=()):
        return SqliteCursor(self.connection).execute(sql, params).fetchone()

    def device(self, device_id="node01", room="A", lifecycle="active", credential="active"):
        self.connection.execute("INSERT INTO devices(device_id,room_id,device_name,mqtt_username,lifecycle_status,credential_status,mqtt_sync_status) VALUES(?,?,?,?,?,?,?)",
                                (device_id, room, device_id, "u_" + device_id, lifecycle, credential, "synced"))
        self.connection.commit()


class FakeMqtt:
    def __init__(self, database):
        self.database, self.published = database, []
        self.fail = False

    def is_connected(self):
        return True

    def publish(self, topic, payload, **options):
        request_id = json.loads(payload)["request_id"]
        row = self.database.row("SELECT status FROM device_commands WHERE request_id=%s", (request_id,))
        assert row["status"] == "queued", "A durable command must exist before MQTT publication"
        self.published.append((topic, json.loads(payload), options))
        if self.fail:
            raise OSError("private transport diagnostic")
        return SimpleNamespace(rc=0)


class FakeAdmin:
    def __init__(self, database):
        self.database = database
        self.users, self.rules, self.sessions = {}, {}, {}
        self.fail = None

    def _step(self, name):
        if self.fail == name:
            raise emqx_admin.AdminError("emqx_test_failure")

    def ensure_node_usernames(self, usernames):
        pass

    def validate_device_identities(self, device_id, usernames, managed_usernames):
        pass  # Fixture accounts are explicitly trusted by the test deployment.

    def check(self):
        self._step("check")

    def deny(self, username):
        self._step("deny")
        self.rules[username] = "deny"

    def put_user(self, username, password):
        self._step("put")
        self.users[username] = password

    def delete_user(self, username):
        # Backend rejection must already be committed before removing broker credentials.
        row = self.database.row("SELECT credential_status FROM devices WHERE mqtt_username=%s", (username,))
        if row:
            assert row["credential_status"] in ("revoked", "pending")
        self._step("delete")
        self.users.pop(username, None)

    def disconnect(self, username):
        self._step("disconnect")
        self.sessions.pop(username, None)

    def allow_device(self, username, device_id):
        self._step("allow")
        self.rules[username] = device_id


class BackendTests(unittest.TestCase):
    database_factory = Database

    def setUp(self):
        self.db = self.database_factory()
        self.patches = [patch.object(module, "session", self.db.session)
                        for module in (storage, devices_api, device_runtime, mqtt_lifecycle)]
        self.patches.append(patch.dict(os.environ, {"JWT_SECRET": SECRET}))
        for item in self.patches:
            item.start()
        self.addCleanup(lambda: [item.stop() for item in reversed(self.patches)])
        self.addCleanup(self.db.connection.close)
        self.mqtt = FakeMqtt(self.db)
        self.admin = FakeAdmin(self.db)
        application.app.state.receiver = SimpleNamespace(snapshot=lambda: {"connected": True, "last_error": None})
        application.app.state.command_worker_ready = True
        application.app.state.remote_control = RemoteController(self.mqtt)
        application.app.state.buzzer_control = BuzzerController(self.mqtt)
        application.app.state.emqx_admin = self.admin
        self.client = TestClient(application.app)
        self.addCleanup(self.client.close)

    def headers(self, user=ADMIN, **claims):
        token = jwt.encode({**user, "exp": datetime.now(timezone.utc) + timedelta(minutes=5), **claims}, SECRET, algorithm="HS256")
        return {"Authorization": "Bearer " + token, "X-IoT-Request": "1"}

    def sample(self, device_id="node01", seq=1):
        data = json.loads((ROOT / "examples/telemetry-normal.json").read_text(encoding="utf-8"))
        data.update(device_id=device_id, room="A", seq=seq)
        return data

    def item(self):
        return storage.read_latest(ADMIN)[0]

    def threshold_body(self):
        data = self.sample()
        return {"expected_boot_id": data["boot_id"], "expected_revision": 0,
                "thresholds": {"mq2_on": 650, "mq2_off": 550, "temperature_on_c": 65, "temperature_off_c": 60}}

    def test_ingestion_status_matrix_and_unregistered(self):
        with self.assertRaises(storage.DeviceNotRegistered):
            storage.save(self.sample())
        for lifecycle in ("registered", "provisioned", "active", "maintenance", "blocked", "decommissioned"):
            for credential in ("pending", "active", "revoked"):
                with self.subTest(lifecycle=lifecycle, credential=credential):
                    self.db.connection.execute("DELETE FROM devices")
                    self.db.device(lifecycle=lifecycle, credential=credential)
                    if (lifecycle, credential) == ("active", "active"):
                        self.assertTrue(storage.save(self.sample()))
                        self.db.connection.execute("DELETE FROM history")
                    else:
                        with self.assertRaises(storage.DeviceNotAllowed):
                            storage.save(self.sample())

    def test_duplicate_does_not_change_last_seen_or_version(self):
        self.db.device()
        data = self.sample()
        data["firmware_version"] = "v6-a"
        first = datetime(2026, 11, 6, tzinfo=timezone.utc)
        self.assertTrue(storage.save(data, first))
        data["firmware_version"] = "v6-b"
        self.assertFalse(storage.save(data, first + timedelta(seconds=60)))
        row = self.db.row("SELECT last_seen_at, firmware_version FROM devices")
        self.assertEqual(row["last_seen_at"], first.replace(tzinfo=None))
        self.assertEqual(row["firmware_version"], "v6-a")

    def test_full_device_id_is_part_of_duplicate_key(self):
        self.db.device("a" * 30 + "01")
        self.db.device("a" * 30 + "02")
        for suffix in ("01", "02"):
            self.assertTrue(storage.save(self.sample("a" * 30 + suffix)))
        self.assertEqual(self.db.row("SELECT COUNT(*) AS count FROM history")["count"], 2)

    def test_registry_lists_never_seen_node_and_separates_status(self):
        self.db.device(lifecycle="registered", credential="pending")
        result = self.client.get("/api/devices", headers=self.headers()).json()["items"][0]
        self.assertIsNone(result["data"])
        self.assertFalse(result["online"])
        self.assertEqual(result["lifecycle_status"], "registered")
        self.assertEqual(result["sensors"], [])

    def test_authentication_missing_expired_locked_and_stale_role(self):
        self.assertEqual(self.client.get("/api/devices").status_code, 401)
        for user, claims in ((ADMIN, {"exp": 1}), ({"user_id": 1005, "role": "admin"}, {}),
                             ({"user_id": 1002, "role": "admin"}, {})):
            self.assertEqual(self.client.get("/api/devices", headers=self.headers(user, **claims)).status_code, 401)
        token = jwt.encode(ADMIN, SECRET, algorithm="HS256")
        self.assertEqual(self.client.get("/api/devices", headers={"Authorization": "Bearer " + token}).status_code, 401)

    def test_room_scope_lists_and_control_cannot_cross_rooms(self):
        self.db.device()
        self.db.device("node02", "B")
        storage.save(self.sample())
        nodes = self.client.get("/api/devices", headers=self.headers(OWNER)).json()["items"]
        self.assertEqual([node["device_id"] for node in nodes], ["node01"])
        for user in (OWNER, TENANT):
            response = self.client.post("/api/devices/node02/thresholds", headers=self.headers(user), json=self.threshold_body())
            self.assertEqual(response.status_code, 403)
        self.assertEqual(self.mqtt.published, [])

    def test_room_move_preserves_history_and_does_not_expose_old_sample(self):
        self.db.device()
        storage.save(self.sample())
        response = self.client.patch("/api/devices/node01/room", headers=self.headers(), json={"room_id": "B"})
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(self.db.row("SELECT room_id FROM history")["room_id"], "A")
        new_owner = {"user_id": 1004, "role": "owner"}
        self.assertIsNone(storage.read_latest(new_owner)[0]["data"])
        self.assertEqual(storage.history("node01", user=new_owner), [])
        self.assertEqual(len(storage.history("node01", user=OWNER)), 1)

    def test_history_interval_timezone_and_authorized_rows(self):
        self.db.device()
        moment = datetime(2026, 11, 6, tzinfo=timezone.utc)
        for seq in range(3):
            storage.save(self.sample(seq=seq), moment + timedelta(seconds=seq))
        response = self.client.get("/api/history", params={"device_id": "node01", "from": moment.isoformat(), "to": moment.isoformat()}, headers=self.headers())
        self.assertEqual(len(response.json()["items"]), 1)
        self.assertTrue(response.json()["items"][0]["received_at"].endswith("+00:00"))
        for params in ({"from": "2026-11-06T00:00:00"}, {"from": "1234567890"}, {"from": "2026-11-07T00:00:00Z", "to": "2026-11-06T00:00:00Z"}):
            response = self.client.get("/api/history", params={"device_id": "node01", **params}, headers=self.headers())
            self.assertEqual(response.status_code, 422)

    def test_command_is_durable_before_publish_and_only_ack_confirms(self):
        self.db.device()
        storage.save(self.sample())
        response = self.client.post("/api/devices/node01/thresholds", headers=self.headers(OWNER), json=self.threshold_body())
        self.assertEqual(response.status_code, 202, response.text)
        command = response.json()
        self.assertEqual(command["status"], "pending")
        row = self.db.row("SELECT * FROM device_commands")
        self.assertEqual((row["requested_by"], row["room_id"], row["status"]), (1002, "A", "pending"))
        ack = self.sample(seq=2)
        ack["remote_config"].update(revision=1, last_request_id=command["request_id"])
        ack["mq2"].update(adc_on=650, adc_off=550)
        ack["limits"].update(temperature_on_c=65, temperature_off_c=60)
        application.app.state.remote_control.observe(ack)
        self.assertEqual(self.db.row("SELECT status FROM device_commands")["status"], "applied")
        application.app.state.remote_control = RemoteController(self.mqtt)
        history = self.client.get("/api/devices/node01/commands", headers=self.headers()).json()["items"]
        self.assertEqual(history[0]["status"], "applied")

    def test_database_failure_prevents_publish(self):
        self.db.device()
        storage.save(self.sample())
        with patch.object(storage, "create_command", side_effect=storage.StorageError("private secret")):
            response = self.client.post("/api/devices/node01/thresholds", headers=self.headers(), json=self.threshold_body())
        self.assertEqual(response.status_code, 503)
        self.assertNotIn("private secret", response.text)
        self.assertEqual(self.mqtt.published, [])

    def test_publish_failure_has_durable_result(self):
        self.db.device()
        storage.save(self.sample())
        self.mqtt.fail = True
        response = self.client.post("/api/devices/node01/thresholds", headers=self.headers(), json=self.threshold_body())
        self.assertEqual(response.status_code, 503)
        self.assertEqual(self.db.row("SELECT status FROM device_commands")["status"], "unconfirmed")
        self.assertNotIn("private transport", response.text)

    def test_timeout_without_dashboard_and_restart_pending(self):
        self.db.device()
        storage.save(self.sample())
        controller = application.app.state.remote_control
        command = controller.submit(self.item(), ThresholdUpdate(**self.threshold_body()), True, ADMIN)
        controller.commands["node01"]["deadline"] = 0
        controller.tick()
        self.assertEqual(self.db.row("SELECT status FROM device_commands")["status"], "timeout")
        self.db.connection.execute("UPDATE device_commands SET status='pending',deadline_at='2099-01-01 00:00:00'")
        self.db.connection.commit()
        storage.recover_commands()
        self.assertEqual(self.db.row("SELECT status FROM device_commands")["status"], "interrupted")

    def test_buzzer_ack_and_noop_are_persisted(self):
        self.db.device()
        storage.save(self.sample())
        body = {"expected_boot_id": self.sample()["boot_id"], "expected_seq": 0, "action": "stop"}
        response = self.client.post("/api/devices/node01/buzzer-test", headers=self.headers(), json=body)
        self.assertEqual(response.status_code, 202, response.text)
        self.assertEqual(self.db.row("SELECT status FROM device_commands")["status"], "stopped")
        self.assertEqual(self.mqtt.published, [])
        body["action"] = "start"
        response = self.client.post("/api/devices/node01/buzzer-test", headers=self.headers(), json=body)
        ack = self.sample(seq=2)
        ack["buzzer_test"].update(last_request_id=response.json()["request_id"], command_seq=1, status="completed")
        application.app.state.buzzer_control.observe(ack)
        rows = storage.command_history("node01", 20, ADMIN)
        self.assertEqual(rows[0]["status"], "completed")

    def test_mqtt_provision_requires_real_steps_then_explicit_activation(self):
        self.db.device(lifecycle="registered", credential="pending")
        operation = mqtt_lifecycle.request_operation(self.admin, ADMIN, "node01", "provision", PASSWORD)
        self.assertEqual(operation["status"], "succeeded")
        self.assertNotIn("password_digest", operation)
        self.assertNotIn(PASSWORD, json.dumps(operation))
        device = self.db.row("SELECT * FROM devices")
        self.assertEqual((device["lifecycle_status"], device["credential_status"]), ("provisioned", "active"))
        with self.assertRaises(storage.DeviceNotAllowed):
            storage.save(self.sample())
        response = self.client.patch("/api/devices/node01/lifecycle", headers=self.headers(), json={"lifecycle_status": "active"})
        self.assertEqual(response.status_code, 200, response.text)
        self.assertTrue(storage.save(self.sample()))

    def _assert_backend_pause_resume(self, paused):
        self.db.device()
        self.db.device("node02")
        self.db.connection.execute("UPDATE devices SET mqtt_sync_status='unknown' WHERE device_id='node01'")
        self.db.connection.commit()
        self.assertTrue(storage.save(self.sample()))
        self.admin.users["u_node01"] = "existing-account"
        self.admin.sessions["u_node01"] = ["existing-client"]
        broker_before = copy.deepcopy((self.admin.users, self.admin.rules, self.admin.sessions))
        url = "/api/devices/node01/lifecycle"
        response = self.client.patch(url, headers=self.headers(OWNER), json={"lifecycle_status": paused})
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()["credential_status"], "active")
        self.assertEqual(response.json()["mqtt_sync_status"], "unknown")
        with self.assertRaises(storage.DeviceNotAllowed):
            storage.save(self.sample(seq=2))
        self.assertTrue(storage.save(self.sample("node02")))
        before = self.db.row("SELECT * FROM devices WHERE device_id='node01'")
        self.assertEqual(before["lifecycle_status"], paused)
        # A note edit must not lose the durable pause, even across a new API client.
        response = self.client.patch(url, headers=self.headers(OWNER), json={"maintenance_note": "checked"})
        self.assertEqual(response.status_code, 200, response.text)
        restarted_client = TestClient(application.app)
        try:
            response = restarted_client.patch(url, headers=self.headers(OWNER), json={"lifecycle_status": "active"})
        finally:
            restarted_client.close()
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()["lifecycle_status"], "active")
        self.assertTrue(storage.save(self.sample(seq=2)))
        device = self.db.row("SELECT * FROM devices WHERE device_id='node01'")
        for key in ("mqtt_username", "mqtt_client_id", "credential_status", "mqtt_sync_status", "mqtt_operation_id"):
            self.assertEqual(device[key], before[key], key)
        self.assertEqual(self.db.row("SELECT COUNT(*) AS n FROM history WHERE device_id='node01'")["n"], 2)
        self.assertEqual((self.admin.users, self.admin.rules, self.admin.sessions), broker_before)
        self.assertEqual(self.db.row("SELECT COUNT(*) AS n FROM mqtt_operations")["n"], 0)

    def test_lifecycle_block_resume_with_unknown_broker_sync(self):
        self._assert_backend_pause_resume("blocked")

    def test_lifecycle_maintenance_resume_with_unknown_broker_sync(self):
        self._assert_backend_pause_resume("maintenance")

    def test_lifecycle_resume_from_maintenance_then_blocked(self):
        self.db.device()
        self.db.connection.execute("UPDATE devices SET mqtt_sync_status='unknown'")
        self.db.connection.commit()
        for status in ("maintenance", "blocked", "active"):
            response = self.client.patch("/api/devices/node01/lifecycle", headers=self.headers(),
                                         json={"lifecycle_status": status})
            self.assertEqual(response.status_code, 200, response.text)
        self.assertTrue(storage.save(self.sample()))

    def test_lifecycle_unknown_sync_cannot_bypass_first_activation(self):
        self.db.device(lifecycle="provisioned")
        self.db.connection.execute("UPDATE devices SET mqtt_sync_status='unknown'")
        self.db.connection.commit()
        for status in ("active", "blocked", "active"):
            response = self.client.patch("/api/devices/node01/lifecycle", headers=self.headers(),
                                         json={"lifecycle_status": status})
            self.assertEqual(response.status_code, 200 if status == "blocked" else 409, response.text)
        self.assertEqual(self.db.row("SELECT lifecycle_status FROM devices")["lifecycle_status"], "blocked")

    def test_lifecycle_resume_checks_credentials_identity_and_operation(self):
        self.db.device()
        self.db.connection.execute("UPDATE devices SET mqtt_sync_status='unknown'")
        self.db.connection.commit()
        url = "/api/devices/node01/lifecycle"
        self.assertEqual(self.client.patch(url, headers=self.headers(), json={"lifecycle_status": "blocked"}).status_code, 200)
        for field, value in (("credential_status", "pending"), ("credential_status", "revoked"),
                             ("mqtt_username", "changed-account"), ("mqtt_operation_id", "a" * 32),
                             ("mqtt_sync_status", "pending"), ("mqtt_sync_status", "failed")):
            with self.subTest(field=field, value=value):
                old = self.db.row("SELECT * FROM devices")[field]
                self.db.connection.execute("UPDATE devices SET " + field + "=?", (value,))
                self.db.connection.commit()
                response = self.client.patch(url, headers=self.headers(), json={"lifecycle_status": "active"})
                self.assertEqual(response.status_code, 409, response.text)
                self.db.connection.execute("UPDATE devices SET " + field + "=?", (old,))
                self.db.connection.commit()

    def test_lifecycle_pause_resume_enforces_permissions(self):
        self.db.device()
        self.db.connection.execute("UPDATE devices SET mqtt_sync_status='unknown'")
        self.db.connection.commit()
        url = "/api/devices/node01/lifecycle"
        for headers, expected in (({}, 401), (self.headers(TENANT), 403),
                                  (self.headers({"user_id": 1004, "role": "owner"}), 403)):
            response = self.client.patch(url, headers=headers, json={"lifecycle_status": "blocked"})
            self.assertEqual(response.status_code, expected, response.text)
        self.assertEqual(self.db.row("SELECT lifecycle_status FROM devices")["lifecycle_status"], "active")

    def test_lifecycle_revoked_node_cannot_use_backend_resume(self):
        self.db.device()
        with patch.object(self.admin, "check", side_effect=emqx_admin.AdminError("emqx_credential_api_unsupported")):
            operation = mqtt_lifecycle.request_operation(self.admin, ADMIN, "node01", "revoke")
        response = self.client.patch("/api/devices/node01/lifecycle", headers=self.headers(),
                                     json={"lifecycle_status": "active"})
        self.assertEqual(response.status_code, 409, response.text)
        device = self.db.row("SELECT * FROM devices")
        self.assertEqual((device["lifecycle_status"], device["credential_status"], device["mqtt_sync_status"]),
                         ("blocked", "revoked", "failed"))
        self.assertEqual(device["mqtt_operation_id"], operation["operation_id"])

    def test_lifecycle_pause_interrupts_pending_control(self):
        self.db.device()
        storage.save(self.sample())
        response = self.client.post("/api/devices/node01/thresholds", headers=self.headers(), json=self.threshold_body())
        self.assertEqual(response.status_code, 202, response.text)
        response = self.client.patch("/api/devices/node01/lifecycle", headers=self.headers(),
                                     json={"lifecycle_status": "maintenance"})
        self.assertEqual(response.status_code, 200, response.text)
        command = self.db.row("SELECT status, error_message FROM device_commands")
        self.assertEqual(command, {"status": "interrupted", "error_message": "device_lifecycle_changed"})
        response = self.client.post("/api/devices/node01/thresholds", headers=self.headers(), json=self.threshold_body())
        self.assertEqual(response.status_code, 409, response.text)
        self.assertEqual(len(self.mqtt.published), 1)

    def test_mqtt_revoke_partial_retry_reissue_and_stale_retry(self):
        self.db.device()
        self.admin.users["u_node01"] = "old-password"
        self.admin.sessions["u_node01"] = ["client-id-different-from-device-id"]
        self.admin.fail = "disconnect"
        operation = mqtt_lifecycle.request_operation(self.admin, ADMIN, "node01", "revoke")
        self.assertEqual(operation["status"], "incomplete")
        self.assertEqual(self.db.row("SELECT credential_status FROM devices")["credential_status"], "revoked")
        with self.assertRaises(storage.DeviceNotAllowed):
            storage.save(self.sample())
        self.admin.fail = None
        retried = mqtt_lifecycle.run_operation(self.admin, ADMIN, "node01", operation["operation_id"])
        self.assertEqual(retried["status"], "succeeded")
        self.assertNotIn("u_node01", self.admin.sessions)
        issued = mqtt_lifecycle.request_operation(self.admin, ADMIN, "node01", "reissue", PASSWORD)
        self.assertNotEqual(issued["target_username"], "u_node01")
        self.assertNotIn("u_node01", self.admin.users)
        with self.assertRaises(HTTPException):
            mqtt_lifecycle.run_operation(self.admin, ADMIN, "node01", operation["operation_id"])

    def test_failed_grant_retry_reuses_account_and_requires_same_password(self):
        self.db.device(lifecycle="registered", credential="pending")
        self.admin.fail = "allow"
        operation = mqtt_lifecycle.request_operation(self.admin, ADMIN, "node01", "provision", PASSWORD)
        target = operation["target_username"]
        self.assertEqual(operation["status"], "incomplete")
        with self.assertRaises(HTTPException):
            mqtt_lifecycle.run_operation(self.admin, ADMIN, "node01", operation["operation_id"], "different-password")
        self.admin.fail = None
        result = mqtt_lifecycle.run_operation(self.admin, ADMIN, "node01", operation["operation_id"], PASSWORD)
        self.assertEqual(result["target_username"], target)
        self.assertEqual(list(self.admin.users), [target])

    def test_revoke_cleans_up_incomplete_grant_and_cannot_reactivate_it(self):
        self.db.device(lifecycle="registered", credential="pending")
        self.admin.fail = "allow"
        grant = mqtt_lifecycle.request_operation(self.admin, ADMIN, "node01", "provision", PASSWORD)
        self.admin.fail = None
        revoke = mqtt_lifecycle.request_operation(self.admin, ADMIN, "node01", "revoke")
        self.assertEqual(revoke["status"], "succeeded")
        self.assertEqual(self.admin.users, {})
        with self.assertRaises(HTTPException):
            mqtt_lifecycle.run_operation(self.admin, ADMIN, "node01", grant["operation_id"], PASSWORD)

    def test_retired_node_cannot_be_reissued(self):
        self.db.device(lifecycle="decommissioned", credential="revoked")
        with self.assertRaises(HTTPException):
            mqtt_lifecycle.request_operation(self.admin, ADMIN, "node01", "reissue", PASSWORD)

    def test_lifecycle_cannot_mark_credentials_active_without_broker(self):
        self.db.device(lifecycle="registered", credential="pending")
        response = self.client.patch("/api/devices/node01/lifecycle", headers=self.headers(), json={"credential_status": "active"})
        self.assertEqual(response.status_code, 409)

    def test_metadata_versions_and_transfer_permissions(self):
        self.db.device()
        response = self.client.patch("/api/devices/node01", headers=self.headers(OWNER), json={"hardware_version": "board-r2", "firmware_version": "v6"})
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(self.client.get("/api/devices/node01", headers=self.headers(OWNER)).json()["firmware_version"], "v6")
        self.assertEqual(self.client.patch("/api/devices/node01/room", headers=self.headers(OWNER), json={"room_id": "B"}).status_code, 403)

    def test_receiver_rejection_does_not_stop_other_nodes_and_duplicate_not_observed(self):
        receiver = Receiver.__new__(Receiver)
        receiver.lock = threading.Lock()
        receiver.status = {"accepted": 0, "rejected": 0, "duplicates": 0, "last_error": None}
        accepted = []
        receiver.on_accepted = lambda data: accepted.append(data["device_id"])
        self.db.device(lifecycle="registered", credential="pending")
        self.db.device("node02")
        for device_id in ("node01", "node02", "node02"):
            message = SimpleNamespace(topic="iot/devices/" + device_id + "/telemetry", retain=False,
                                      payload=json.dumps(self.sample(device_id)).encode())
            receiver.on_message(None, None, message)
        self.assertEqual((receiver.status["rejected"], receiver.status["accepted"], receiver.status["duplicates"]), (1, 1, 1))
        self.assertEqual(accepted, ["node02"])

    def test_all_data_and_control_routes_reject_missing_token(self):
        for method, path, body in (
            ("GET", "/api/history?device_id=node01", None),
            ("GET", "/api/devices/node01", None),
            ("GET", "/api/devices/node01/commands", None),
            ("POST", "/api/devices/node01/thresholds", self.threshold_body()),
            ("POST", "/api/devices/node01/buzzer-test", {"expected_boot_id": self.sample()["boot_id"], "expected_seq": 0, "action": "start"}),
            ("POST", "/api/devices/node01/mqtt-credentials", {"action": "revoke"}),
        ):
            with self.subTest(path=path):
                self.assertEqual(self.client.request(method, path, json=body).status_code, 401)

    def test_maintenance_cannot_control_even_with_recent_telemetry(self):
        self.db.device()
        storage.save(self.sample())
        self.db.connection.execute("UPDATE devices SET lifecycle_status='maintenance'")
        self.db.connection.commit()
        result = self.client.post("/api/devices/node01/thresholds", headers=self.headers(), json=self.threshold_body())
        self.assertEqual(result.status_code, 409)
        self.assertEqual(self.mqtt.published, [])

    def test_unconfirmed_delivery_can_later_be_acknowledged(self):
        self.db.device()
        storage.save(self.sample())
        self.mqtt.fail = True
        self.client.post("/api/devices/node01/thresholds", headers=self.headers(), json=self.threshold_body())
        controller = application.app.state.remote_control
        command = controller.commands["node01"]
        ack = self.sample(seq=2)
        ack["remote_config"].update(revision=1, last_request_id=command["request_id"])
        ack["mq2"].update(adc_on=650, adc_off=550)
        ack["limits"].update(temperature_on_c=65, temperature_off_c=60)
        controller.observe(ack)
        row = self.db.row("SELECT status, response_payload FROM device_commands")
        self.assertEqual(row["status"], "applied")
        self.assertNotIn("temperature", json.loads(row["response_payload"]))

    def test_room_move_interrupts_pending_commands_without_exposing_new_room(self):
        self.db.device()
        storage.save(self.sample())
        response = self.client.post("/api/devices/node01/thresholds", headers=self.headers(), json=self.threshold_body())
        self.client.patch("/api/devices/node01/room", headers=self.headers(), json={"room_id": "B"})
        ack = self.sample(seq=2)
        ack["room"] = "B"
        ack["remote_config"].update(revision=1, last_request_id=response.json()["request_id"])
        ack["mq2"].update(adc_on=650, adc_off=550)
        ack["limits"].update(temperature_on_c=65, temperature_off_c=60)
        application.app.state.remote_control.observe(ack)
        row = self.db.row("SELECT room_id, status, response_payload FROM device_commands")
        self.assertEqual((row["room_id"], row["status"], row["response_payload"]), ("A", "interrupted", None))
        new_owner = {"user_id": 1004, "role": "owner"}
        self.assertEqual(storage.command_history("node01", 20, new_owner), [])

    def test_expired_tenant_assignment_removes_read_access(self):
        self.db.device()
        self.db.connection.execute("UPDATE room_users SET ended_at='2021-01-01 00:00:00'")
        self.db.connection.commit()
        self.assertEqual(storage.read_latest(TENANT), [])
        self.assertEqual(self.client.get("/api/devices/node01", headers=self.headers(TENANT)).status_code, 403)

    def test_expire_untracked_queued_command(self):
        self.db.device()
        storage.save(self.sample())
        self.client.post("/api/devices/node01/thresholds", headers=self.headers(), json=self.threshold_body())
        self.db.connection.execute("UPDATE device_commands SET status='queued', deadline_at='2020-01-01 00:00:00'")
        self.db.connection.commit()
        storage.expire_commands()
        self.assertEqual(self.db.row("SELECT status FROM device_commands")["status"], "timeout")

    def test_credential_api_does_not_echo_password_on_invalid_input(self):
        self.db.device(lifecycle="registered", credential="pending")
        result = self.client.post("/api/devices/node01/mqtt-credentials", headers=self.headers(), json={"action": "provision", "password": "short-secret"})
        self.assertEqual(result.status_code, 422)
        self.assertNotIn("short-secret", result.text)

    def test_registry_storage_errors_are_sanitized(self):
        self.db.device()
        with patch.object(devices_api, "session", side_effect=storage.StorageError("private-connection-secret")):
            result = self.client.get("/api/devices/node01", headers=self.headers())
        self.assertEqual(result.status_code, 503)
        self.assertNotIn("private-connection-secret", result.text)


class AdapterAndTransactionTests(unittest.TestCase):
    def test_topic_acl_has_exact_device_topics_and_deny_fallback(self):
        admin = emqx_admin.EmqxAdmin({})
        with patch.object(admin, "set_rules") as set_rules:
            admin.allow_device("u_node01", "node01")
        rules = set_rules.call_args.args[1]
        self.assertEqual([row["topic"] for row in rules if row["permission"] == "allow"],
                         ["iot/devices/node01/telemetry", "iot/devices/node01/config/set", "iot/devices/node01/buzzer/test"])
        self.assertTrue(any(row["permission"] == "deny" and row["topic"] == "#" for row in rules))

    def test_http_timeout_and_error_responses_do_not_expose_secrets(self):
        admin = emqx_admin.EmqxAdmin({"base_url": "https://broker.test/api/v5", "api_key": "secret-key", "api_secret": "secret-value"})
        with patch("app.integrations.emqx.admin.requests.request", side_effect=emqx_admin.requests.Timeout("secret-value")):
            with self.assertRaises(emqx_admin.AdminError) as caught:
                admin.delete_user("node")
        self.assertNotIn("secret", str(caught.exception))

    def test_disconnect_uses_username_and_actual_client_id(self):
        admin = emqx_admin.EmqxAdmin({})
        responses = [{"data": [{"clientid": "esp-chip-567", "username": "node-user"}, {"clientid": "backend", "username": "backend-user"}]},
                     {"username": "node-user"}, {}, {"data": []}]
        with patch.object(admin, "_request", side_effect=responses) as request:
            admin.disconnect("node-user")
        self.assertEqual(request.call_args_list[2].args[:2], ("DELETE", "/clients/esp-chip-567"))
        self.assertFalse(any(call.args[:2] == ("DELETE", "/clients/backend") for call in request.call_args_list))

    def test_unsupported_serverless_never_reports_ready(self):
        result = emqx_admin.EmqxAdmin({"deployment": "serverless"}).capabilities()
        self.assertFalse(result["credential_automation_ready"])

    def test_protected_backend_account_is_not_modified(self):
        admin = emqx_admin.EmqxAdmin({"protected_usernames": ["backend"]})
        with self.assertRaises(emqx_admin.AdminError):
            admin.ensure_node_usernames(["backend"])

    def test_unverified_existing_broker_account_cannot_be_adopted(self):
        admin = emqx_admin.EmqxAdmin({})
        with patch.object(admin, "_request", return_value={"user_id": "someone-else"}):
            with self.assertRaises(emqx_admin.AdminError):
                admin.validate_device_identities("node01", ["someone-else"], [])

    def test_absent_reference_username_and_verified_legacy_mapping(self):
        admin = emqx_admin.EmqxAdmin({"legacy_node_usernames": {"node01": "legacy-node-user"}})
        admin.validate_device_identities("node01", ["legacy-node-user"], [])
        with patch.object(admin, "_request", return_value=None), patch.object(admin, "clients", return_value=[]):
            admin.validate_device_identities("node01", ["unused-reference"], [])

    def test_transaction_rolls_back_http_errors_and_sets_utc(self):
        connection = unittest.mock.MagicMock()
        with patch.object(storage, "_cfg", {"host": "test", "port": 3306, "user": "test", "password": "test", "database": "test"}), patch.object(storage.pymysql, "connect", return_value=connection) as connect:
            with self.assertRaises(HTTPException):
                with storage.session():
                    raise HTTPException(409, "conflict")
        connection.rollback.assert_called_once()
        connection.commit.assert_not_called()
        self.assertIn("time_zone = '+00:00'", connect.call_args.kwargs["init_command"])


if __name__ == "__main__":
    unittest.main()
