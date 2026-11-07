"""Run the backend API suite and migrations against an isolated local MySQL datadir.

Refuses to use the existing MySQL service or an arbitrary server. Start a separate
mysqld with test-output/mysql-long-review/data, bound to 127.0.0.1:13317 first.
No existing database is dropped or reset. All test databases have random names.
"""
import json
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
import re
import subprocess
import threading
import unittest
import uuid
from unittest.mock import patch

import test_backend as isolated
import pymysql
import scripts.migrate as migrate
import app.db.device_storage as storage

ROOT = isolated.ROOT
DATA = (ROOT / "test-output/mysql-long-review/data").resolve()
REAL_SESSION = storage.session
CONNECTION = {"host": "127.0.0.1", "port": 13317, "user": "root", "password": "",
              "charset": "utf8mb4", "cursorclass": pymysql.cursors.DictCursor,
              "init_command": "SET time_zone = '+00:00'", "autocommit": True}
CREATED = []


def execute_script(connection, script, database):
    script = re.sub(r"--[^\n]*", "", script)
    script = script.replace("CREATE DATABASE IF NOT EXISTS iot_db", "CREATE DATABASE " + database)
    script = script.replace("USE iot_db", "USE " + database)
    with connection.cursor() as cursor:
        for statement in script.split(";"):
            if statement.strip():
                cursor.execute(statement)


def create_database(schema=None):
    connection = pymysql.connect(**CONNECTION)
    with connection.cursor() as cursor:
        cursor.execute("SELECT @@datadir AS datadir, @@port AS port")
        actual = cursor.fetchone()
    if Path(actual["datadir"]).resolve() != DATA or actual["port"] != 13317:
        connection.close()
        raise RuntimeError("Refusing to test against a non-isolated MySQL server")
    database = "iot_long_test_" + uuid.uuid4().hex[:16]
    execute_script(connection, schema or (ROOT / "database/init.sql").read_text(encoding="utf-8"), database)
    CREATED.append(database)
    storage.configure({**CONNECTION, "database": database})
    return connection, database


class ConnectionFacade:
    def __init__(self, raw):
        self.raw = raw

    def execute(self, sql, params=()):
        with self.raw.cursor() as cursor:
            cursor.execute(sql.replace("?", "%s"), params)

    def executemany(self, sql, params):
        with self.raw.cursor() as cursor:
            cursor.executemany(sql.replace("?", "%s"), params)

    def commit(self):
        self.raw.commit()

    def close(self):
        self.raw.close()


class MySQLDatabase(isolated.Database):
    def __init__(self):
        raw, self.name = create_database()
        self.connection = ConnectionFacade(raw)
        for user_id, role, status in ((1001, "admin", "active"), (1002, "owner", "active"),
                                      (1003, "tenant", "active"), (1004, "owner", "active"), (1005, "admin", "locked")):
            self.connection.execute("INSERT INTO users(user_id,username,password_hash,role,status) VALUES(?,?,?,?,?)",
                                    (user_id, "u" + str(user_id), "test-only", role, status))
        self.connection.executemany("INSERT INTO houses(house_id,owner_id,house_name) VALUES(?,?,?)", [(1, 1002, "own"), (2, 1004, "other")])
        self.connection.executemany("INSERT INTO rooms(room_id,house_id,room_name) VALUES(?,?,?)", [("A", 1, "A"), ("A2", 1, "A2"), ("B", 2, "B")])
        self.connection.execute("INSERT INTO room_users(room_id,user_id,started_at) VALUES('A',1003,'2020-01-01 00:00:00')")

    def session(self):
        return REAL_SESSION()

    def row(self, sql, params=()):
        with self.connection.raw.cursor() as cursor:
            cursor.execute(sql, params)
            return cursor.fetchone()


class RealMySQLBackendTests(isolated.BackendTests):
    database_factory = MySQLDatabase


class MigrationTests(unittest.TestCase):
    def check_upgrade(self, legacy_file):
        script = subprocess.run(["git", "show", "f6f2e7b:database/" + legacy_file], cwd=ROOT,
                                capture_output=True, text=True, encoding="utf-8", check=True).stdout
        connection, name = create_database(script)
        self.addCleanup(connection.close)
        with connection.cursor() as cursor:
            cursor.execute("INSERT INTO users(user_id,username,password_hash,role,status) VALUES(1001,'test','test','admin','active')")
            cursor.execute("INSERT INTO houses(house_id,owner_id,house_name) VALUES(1,1001,'house')")
            cursor.execute("INSERT INTO rooms(room_id,house_id,room_name) VALUES('A',1,'A')")
            cursor.execute("INSERT INTO devices(device_id,room_id,device_name,mqtt_username,lifecycle_status,credential_status) "
                           "VALUES('node01','A','node','node-user','active','active')")
            cursor.execute("INSERT INTO history(timestamp,device_id,room_id,room,boot_id,seq,raw_payload) "
                           "VALUES(UTC_TIMESTAMP(),'node01','A','A','0123456789abcdef',1,'{}')")
        changes = migrate.migrate(apply=False)
        self.assertTrue(changes)
        migrate.migrate(apply=True)
        self.assertEqual(migrate.migrate(apply=True), [])
        with connection.cursor() as cursor:
            cursor.execute("SELECT COUNT(*) AS count FROM history")
            self.assertEqual(cursor.fetchone()["count"], 1)
            cursor.execute("SELECT credential_status, mqtt_sync_status FROM devices")
            self.assertEqual(cursor.fetchone(), {"credential_status": "active", "mqtt_sync_status": "unknown"})
            cursor.execute("SELECT character_maximum_length AS width FROM information_schema.columns "
                           "WHERE table_schema=DATABASE() AND table_name='devices' AND column_name='device_id'")
            self.assertEqual(cursor.fetchone()["width"], 64)
        storage.initialize()

    def test_migrate_previous_canonical_schema_preserves_history(self):
        self.check_upgrade("init.sql")

    def test_migrate_legacy_50_character_schema_preserves_history(self):
        self.check_upgrade("init_db.sql")

    def test_fresh_schema_and_exclusive_backend_lock(self):
        connection, _ = create_database()
        self.addCleanup(connection.close)
        storage.initialize()
        with storage.backend_guard():
            with self.assertRaises(storage.StorageError):
                with storage.backend_guard():
                    self.fail("A second backend must not start")
            with self.assertRaises(storage.StorageError):
                migrate.migrate(apply=True)

    def test_prefix_unique_index_is_replaced_with_full_device_id(self):
        connection, _ = create_database()
        self.addCleanup(connection.close)
        with connection.cursor() as cursor:
            cursor.execute("SELECT index_name AS name FROM information_schema.statistics "
                           "WHERE table_schema=DATABASE() AND table_name='history' AND column_name='boot_id' AND non_unique=0")
            name = cursor.fetchone()["name"]
            cursor.execute("ALTER TABLE history DROP INDEX " + migrate.identifier(name) +
                           ", ADD UNIQUE KEY uq_legacy_prefix (device_id(30), boot_id, seq)")
        migrate.migrate(apply=True)
        self.assertEqual(migrate.migrate(apply=True), [])
        storage.initialize()

    def test_migration_repairs_missing_foreign_key_after_interruption(self):
        connection, _ = create_database()
        self.addCleanup(connection.close)
        with connection.cursor() as cursor:
            cursor.execute("SELECT constraint_name AS name FROM information_schema.key_column_usage "
                           "WHERE table_schema=DATABASE() AND table_name='history' AND referenced_table_name='devices'")
            name = cursor.fetchone()["name"]
            cursor.execute("ALTER TABLE history DROP FOREIGN KEY " + migrate.identifier(name))
        changes = migrate.migrate(apply=True)
        self.assertTrue(any("ADD CONSTRAINT" in statement for statement in changes))
        self.assertEqual(migrate.migrate(apply=True), [])

    def test_revoke_lock_prevents_concurrent_telemetry_insert(self):
        database = MySQLDatabase()
        self.addCleanup(database.connection.close)
        database.device()
        sample = isolated.BackendTests.sample(self)
        started, finished = threading.Event(), threading.Event()
        outcome = []

        def ingest():
            started.set()
            try:
                storage.save(sample)
                outcome.append("accepted")
            except storage.DeviceNotAllowed:
                outcome.append("rejected")
            finally:
                finished.set()

        with REAL_SESSION() as cursor:
            cursor.execute("SELECT device_id FROM devices WHERE device_id='node01' FOR UPDATE")
            thread = threading.Thread(target=ingest)
            thread.start()
            self.assertTrue(started.wait(2))
            self.assertFalse(finished.wait(0.25), "Ingestion must wait until the lifecycle transaction commits")
            cursor.execute("UPDATE devices SET credential_status='revoked' WHERE device_id='node01'")
        self.assertTrue(finished.wait(5))
        thread.join(timeout=5)
        self.assertEqual(outcome, ["rejected"])
        self.assertEqual(database.row("SELECT COUNT(*) AS count FROM history")["count"], 0)

    def test_application_lifespan_worker_and_shutdown(self):
        database = MySQLDatabase()
        self.addCleanup(database.connection.close)
        ticked = threading.Event()
        receiver = isolated.SimpleNamespace(client=isolated.FakeMqtt(database), start=lambda: None,
                                            stop=lambda: None, snapshot=lambda: {"connected": True, "last_error": None})
        discovery = isolated.SimpleNamespace(start=lambda: None, stop=lambda: None, snapshot=lambda: {})
        config = {"mysql": dict(storage._cfg), "emqx_admin": {}, "mqtt_username": "backend-test-user"}
        expire = storage.expire_commands

        def observed_expiry():
            expire()
            ticked.set()

        with patch.dict(isolated.os.environ, {"JWT_SECRET": isolated.SECRET}), \
             patch.object(isolated.app_lifespan, "load_settings", return_value=config), \
             patch.object(isolated.app_lifespan, "Receiver", return_value=receiver), \
             patch.object(isolated.app_lifespan, "DiscoveryResponder", return_value=discovery), \
             patch.object(isolated.app_lifespan, "expire_commands", side_effect=observed_expiry):
            with isolated.TestClient(isolated.application.app) as client:
                self.assertEqual(client.get("/api/health").status_code, 200)
                self.assertTrue(isolated.application.app.state.command_worker_ready)
                self.assertTrue(ticked.wait(4), "The command worker must run without dashboard requests")
            self.assertFalse(isolated.application.app.state.command_worker_ready)
        with storage.backend_guard():
            pass  # Shutdown released the database-wide lease.


if __name__ == "__main__":
    suite = unittest.TestSuite([
        unittest.defaultTestLoader.loadTestsFromTestCase(RealMySQLBackendTests),
        unittest.defaultTestLoader.loadTestsFromTestCase(MigrationTests),
    ])
    result = unittest.TextTestRunner(verbosity=1, failfast=True).run(suite)
    with pymysql.connect(**CONNECTION) as metadata:
        with metadata.cursor() as cursor:
            cursor.execute("SELECT VERSION() AS version")
            mysql_version = cursor.fetchone()["version"]
    (DATA.parent / "mysql-results.json").write_text(json.dumps({
        "tested_at_utc": datetime.now(timezone.utc).isoformat(), "tests_run": result.testsRun,
        "failures": len(result.failures), "errors": len(result.errors),
        "mysql_port": 13317, "database_count": len(CREATED),
        "mysql_version": mysql_version,
        "broker": "fake; no live EMQX", "account_tokens": "isolated fixtures, not real login",
    }, indent=2), encoding="utf-8")
    print("Isolated databases retained in the test datadir:", len(CREATED))
    raise SystemExit(0 if result.wasSuccessful() else 1)
