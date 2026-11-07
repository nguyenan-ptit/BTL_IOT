"""Non-destructive, restartable upgrade from the checked 2026-11-06 MySQL schemas.

DDL is read from database/init.sql, the canonical schema. MySQL DDL autocommits:
back up first and stop the backend during --apply. This tool never drops data/tables.
"""
import argparse
import re
from pathlib import Path

from app.core.legacy_settings import load_settings
from app.db.device_storage import StorageError, configure, initialize, session

VERSION = "20261106_01"
SCHEMA = Path(__file__).resolve().parents[2] / "database" / "init.sql"


def identifier(value):
    if not re.fullmatch(r"[A-Za-z0-9_]+", value):
        raise StorageError("Tên bảng/constraint ngoài phạm vi migration; cần kiểm tra thủ công")
    return chr(96) + value + chr(96)


def canonical_tables():
    return dict(re.findall(r"CREATE TABLE ([a-z_]+) (\([\s\S]*?\) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;)",
                           SCHEMA.read_text(encoding="utf-8")))


def plan(cursor):
    tables = canonical_tables()
    cursor.execute("SELECT table_name AS table_name FROM information_schema.tables WHERE table_schema = DATABASE()")
    existing = {row["table_name"] for row in cursor.fetchall()}
    required = {"users", "houses", "rooms", "room_users", "devices", "history", "incidents", "incident_receipts", "audit_logs"}
    if required - existing:
        raise StorageError("Database không phải schema cũ được hỗ trợ; DB mới dùng database/init.sql")
    changes = []
    for table in ("device_commands", "mqtt_operations", "schema_migrations"):
        if table not in existing:
            changes.append("CREATE TABLE " + table + " " + tables[table])
    cursor.execute("SELECT column_name AS column_name FROM information_schema.columns "
                   "WHERE table_schema = DATABASE() AND table_name = 'devices'")
    columns = {row["column_name"] for row in cursor.fetchall()}
    for column in ("mqtt_client_id", "mqtt_sync_status", "mqtt_operation_id"):
        if column not in columns:
            definition = re.search(r"^    " + column + r" ([^\n]+),$", tables["devices"], re.MULTILINE).group(1)
            changes.append("ALTER TABLE devices ADD COLUMN " + column + " " + definition)
    cursor.execute("SELECT table_name AS table_name, character_maximum_length AS character_maximum_length, "
                   "is_nullable AS is_nullable FROM information_schema.columns "
                   "WHERE table_schema = DATABASE() AND column_name = 'device_id' "
                   "AND table_name IN ('devices','history','incidents','device_commands')")
    widths = cursor.fetchall()
    narrow = [row for row in widths if row["character_maximum_length"] < 64]
    # Preserve actual constraint names/rules while widening the legacy VARCHAR(50) schema.
    cursor.execute(
        "SELECT k.table_name AS table_name, k.constraint_name AS constraint_name, k.column_name AS column_name, "
        "r.update_rule AS update_rule, r.delete_rule AS delete_rule "
        "FROM information_schema.key_column_usage k JOIN information_schema.referential_constraints r "
        "ON r.constraint_schema = k.constraint_schema AND r.constraint_name = k.constraint_name "
        "AND r.table_name = k.table_name WHERE k.table_schema = DATABASE() "
        "AND k.referenced_table_name = 'devices' AND k.referenced_column_name = 'device_id'")
    references = cursor.fetchall()
    if any(row["table_name"] not in ("history", "incidents", "device_commands", "mqtt_operations")
           or row["column_name"] != "device_id" for row in references):
        raise StorageError("Có khóa ngoại bổ sung ngoài schema chuẩn; cần kế hoạch migration riêng")
    # Create new tables after width changes; otherwise their new FKs also prevent ALTER.
    creates, changes = [sql for sql in changes if sql.startswith("CREATE TABLE")], [sql for sql in changes if not sql.startswith("CREATE TABLE")]
    if narrow:
        changes += ["ALTER TABLE " + identifier(row["table_name"]) + " DROP FOREIGN KEY " +
                    identifier(row["constraint_name"]) for row in references]
        for row in narrow:
            changes.append("ALTER TABLE " + identifier(row["table_name"]) +
                           " MODIFY device_id VARCHAR(64) " + ("NULL" if row["is_nullable"] == "YES" else "NOT NULL"))
    changes += creates
    for table in ("history", "incidents", "device_commands", "mqtt_operations"):
        refs = [row for row in references if row["table_name"] == table]
        if table not in existing:
            continue  # Its canonical CREATE already includes the FK.
        if not refs or narrow:
            if not refs:
                refs = [{"table_name": table, "constraint_name": "fk_" + table + "_device",
                         "update_rule": "RESTRICT", "delete_rule": "RESTRICT"}]
            for row in refs:
                if row["update_rule"] not in ("RESTRICT", "CASCADE", "SET NULL", "NO ACTION") or row["delete_rule"] not in ("RESTRICT", "CASCADE", "SET NULL", "NO ACTION"):
                    raise StorageError("Quy tắc khóa ngoại không hỗ trợ")
                changes.append("ALTER TABLE " + identifier(table) + " ADD CONSTRAINT " +
                               identifier(row["constraint_name"]) + " FOREIGN KEY (device_id) REFERENCES devices(device_id) "
                               "ON UPDATE " + row["update_rule"] + " ON DELETE " + row["delete_rule"])
    cursor.execute("SELECT index_name AS index_name, GROUP_CONCAT(column_name ORDER BY seq_in_index) AS cols, "
                   "MAX(sub_part) AS prefix_len FROM information_schema.statistics WHERE table_schema = DATABASE() "
                   "AND table_name = 'history' AND non_unique = 0 GROUP BY index_name")
    indexes = cursor.fetchall()
    if not any(row["cols"] == "device_id,boot_id,seq" and row["prefix_len"] is None for row in indexes):
        cursor.execute("SELECT 1 FROM history GROUP BY device_id, boot_id, seq HAVING COUNT(*) > 1 LIMIT 1")
        if cursor.fetchone():
            raise StorageError("history có mẫu trùng; migration dừng và không tự xóa dữ liệu")
        changes.append("ALTER TABLE history ADD UNIQUE KEY uq_history_sample_20261106 (device_id, boot_id, seq)")
        for row in indexes:
            if row["cols"] == "device_id,boot_id,seq" and row["prefix_len"] is not None:
                changes.append("ALTER TABLE history DROP INDEX " + identifier(row["index_name"]))
    return changes


def migrate(*, apply=False):
    with session() as cursor:
        cursor.execute("SELECT GET_LOCK(CONCAT('btl_backend_', LEFT(SHA2(DATABASE(), 256), 32)), 0) AS acquired")
        if cursor.fetchone()["acquired"] != 1:
            raise StorageError("Cần dừng backend/migration khác trước khi nâng cấp")
        try:
            changes = plan(cursor)
            if not apply:
                return changes
            for statement in changes:
                cursor.execute(statement)
            cursor.execute("INSERT INTO schema_migrations (version, applied_at) VALUES (%s, UTC_TIMESTAMP()) "
                           "ON DUPLICATE KEY UPDATE version = version", (VERSION,))
        finally:
            cursor.execute("SELECT RELEASE_LOCK(CONCAT('btl_backend_', LEFT(SHA2(DATABASE(), 256), 32)))")
    initialize()
    return changes


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--check", action="store_true", help="Read-only migration plan")
    mode.add_argument("--apply", action="store_true", help="Apply after backup and backend shutdown")
    args = parser.parse_args()
    try:
        configure(load_settings()["mysql"])
        statements = migrate(apply=args.apply)
    except (StorageError, ValueError) as exc:
        # StorageError only carries a sanitized type/code, never driver messages.
        print("Migration stopped:", str(exc))
        return 1
    print(("Applied" if args.apply else "Planned"), len(statements), "schema changes; no telemetry/management rows deleted.")
    if not args.apply:
        for statement in statements:
            print(statement)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
