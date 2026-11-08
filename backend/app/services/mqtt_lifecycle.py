"""Durable MQTT operations with backend-first blocking and explicit partial results."""
import hashlib
import hmac
import json
import uuid

from fastapi import HTTPException

from app.core.legacy_auth import verify_room_access
from app.integrations.emqx.admin import AdminError
from app.db.device_storage import allowed_device, audit, public_row, session


def _password_digest(operation_id, password):
    return hashlib.pbkdf2_hmac("sha256", password.encode(), bytes.fromhex(operation_id), 260000).hex()


def _managed_device(cursor, user, device_id, *, lock=True):
    device = allowed_device(cursor, user, device_id, lock=lock)
    if not verify_room_access(cursor, user["user_id"], user["role"], device["room_id"]):
        raise HTTPException(403, "Bạn không quản lý phòng này.")
    return device


def _public(operation):
    item = public_row({key: value for key, value in operation.items() if key != "password_digest"})
    for key in ("steps", "subject_usernames"):
        if isinstance(item[key], str):
            item[key] = json.loads(item[key])
    item["message"] = {"succeeded": "Đã hoàn tất thao tác tại EMQX.",
                       "processing": "Đang xử lý tại EMQX; backend đang chặn node.",
                       "incomplete": "Chưa hoàn tất tại EMQX; backend vẫn chặn node. Có thể thử lại."}[item["status"]]
    return item


def get_operation(user, device_id, operation_id):
    with session() as cursor:
        _managed_device(cursor, user, device_id, lock=False)
        cursor.execute("SELECT * FROM mqtt_operations WHERE operation_id = %s AND device_id = %s",
                       (operation_id, device_id))
        operation = cursor.fetchone()
        if not operation:
            raise HTTPException(404, "Không tìm thấy thao tác MQTT.")
    return _public(operation)


def request_operation(admin, user, device_id, action, password=None, *, retire=False, note=None):
    if action != "revoke" and password is None:
        raise HTTPException(422, "Cần mật khẩu MQTT mới từ 16 đến 128 ký tự.")
    if action == "revoke" and password is not None:
        raise HTTPException(422, "Thu hồi không cần mật khẩu.")
    operation_id = uuid.uuid4().hex
    with session() as cursor:
        device = _managed_device(cursor, user, device_id)
        if device["lifecycle_status"] == "decommissioned" and action != "revoke":
            raise HTTPException(409, "Không cấp lại cho thiết bị đã ngừng sử dụng.")
        previous_operation = None
        if device.get("mqtt_operation_id"):
            cursor.execute("SELECT * FROM mqtt_operations WHERE operation_id = %s", (device["mqtt_operation_id"],))
            previous_operation = cursor.fetchone()
        if action != "revoke":
            if previous_operation and previous_operation["status"] != "succeeded":
                raise HTTPException(409, "Cần thử lại hoặc thu hồi thao tác MQTT chưa hoàn tất.")
            if action == "provision" and (device["credential_status"] != "pending" or
                                           device["lifecycle_status"] not in ("registered", "provisioned")):
                raise HTTPException(409, "Thiết bị không ở trạng thái cấp lần đầu.")
            if action == "reissue" and device["credential_status"] != "revoked":
                raise HTTPException(409, "Cần thu hồi thông tin cũ trước khi cấp lại.")
        # Each issuance gets an operation-specific account. A retry reuses exactly this account.
        target = "iot_" + device_id + "_" + operation_id[:16] if action != "revoke" else None
        subjects = [device["mqtt_username"]]
        if previous_operation and previous_operation["status"] != "succeeded":
            subjects += json.loads(previous_operation["subject_usernames"])
            if previous_operation["target_username"]:
                subjects.append(previous_operation["target_username"])
        subjects = sorted(set(subjects))
        # Commit rejection of telemetry BEFORE any broker request, including preflight.
        cursor.execute("UPDATE devices SET credential_status = %s, mqtt_sync_status = 'pending', "
                       "mqtt_operation_id = %s, lifecycle_status = %s, "
                       "decommissioned_at = CASE WHEN %s THEN COALESCE(decommissioned_at, UTC_TIMESTAMP()) "
                       "ELSE decommissioned_at END, maintenance_note = COALESCE(%s, maintenance_note) "
                       "WHERE device_id = %s",
                       ("revoked" if action == "revoke" else "pending", operation_id,
                        "decommissioned" if retire or device["lifecycle_status"] == "decommissioned" else
                        "blocked" if action == "revoke" else device["lifecycle_status"], retire, note, device_id))
        cursor.execute(
            "INSERT INTO mqtt_operations (operation_id, device_id, room_id, requested_by, action, status, "
            "target_username, subject_usernames, password_digest, steps, created_at) "
            "VALUES (%s,%s,%s,%s,%s,'processing',%s,%s,%s,%s,UTC_TIMESTAMP())",
            (operation_id, device_id, device["room_id"], user["user_id"], action, target, json.dumps(subjects),
             _password_digest(operation_id, password) if password else None, json.dumps({"backend_blocked": "succeeded"})))
        audit(cursor, user["user_id"], device["room_id"], "MQTT_OPERATION_REQUESTED", device_id,
              {"operation_id": operation_id, "action": action})
    return run_operation(admin, user, device_id, operation_id, password)


def run_operation(admin, user, device_id, operation_id, password=None):
    # Row locking serializes all retries, room changes, lifecycle changes and credential operations.
    # Initial blocking was committed separately. A crash leaves a retryable processing record.
    with session() as cursor:
        device = _managed_device(cursor, user, device_id)
        cursor.execute("SELECT * FROM mqtt_operations WHERE operation_id = %s AND device_id = %s FOR UPDATE",
                       (operation_id, device_id))
        operation = cursor.fetchone()
        if not operation:
            raise HTTPException(404, "Không tìm thấy thao tác MQTT.")
        if device["mqtt_operation_id"] != operation_id:
            raise HTTPException(409, "Thao tác đã được thay thế; không được cấp quyền lại.")
        if operation["status"] == "succeeded":
            return _public(operation)
        if operation["action"] != "revoke":
            if device["lifecycle_status"] == "decommissioned":
                raise HTTPException(409, "Thiết bị đã ngừng sử dụng.")
            if password is None or not hmac.compare_digest(
                    operation["password_digest"], _password_digest(operation_id, password)):
                raise HTTPException(422, "Thử lại phải dùng đúng mật khẩu của yêu cầu ban đầu.")
        steps = {"backend_blocked": "succeeded"}
        error_code = None

        def step(name, function):
            try:
                function()
            except AdminError:
                steps[name] = "failed"
                raise
            steps[name] = "succeeded"

        try:
            cursor.execute("SELECT target_username FROM mqtt_operations WHERE device_id = %s "
                           "AND target_username IS NOT NULL", (device_id,))
            managed_usernames = [row["target_username"] for row in cursor.fetchall()]
            step("protected_accounts", lambda: admin.ensure_node_usernames(
                json.loads(operation["subject_usernames"]) + ([operation["target_username"]] if operation["target_username"] else [])))
            step("capabilities", admin.check)
            step("device_identities", lambda: admin.validate_device_identities(
                device_id, json.loads(operation["subject_usernames"]), managed_usernames))
            target = operation["target_username"]
            if target:
                step("deny_new_account", lambda: admin.deny(target))
                step("create_account", lambda: admin.put_user(target, password))
            for index, username in enumerate(json.loads(operation["subject_usernames"])):
                step("deny_old_" + str(index), lambda u=username: admin.deny(u))
                step("delete_old_" + str(index), lambda u=username: admin.delete_user(u))
                step("disconnect_old_" + str(index), lambda u=username: admin.disconnect(u))
            if target:
                step("topic_permissions", lambda: admin.allow_device(target, device_id))
                step("disconnect_new_sessions", lambda: admin.disconnect(target))
        except AdminError as exc:
            error_code = exc.code
        status = "incomplete" if error_code else "succeeded"
        cursor.execute("UPDATE mqtt_operations SET status = %s, steps = %s, error_code = %s, "
                       "finished_at = UTC_TIMESTAMP() WHERE operation_id = %s",
                       (status, json.dumps(steps), error_code, operation_id))
        if error_code:
            cursor.execute("UPDATE devices SET mqtt_sync_status = 'failed' WHERE device_id = %s", (device_id,))
        elif operation["action"] == "revoke":
            cursor.execute("UPDATE devices SET mqtt_sync_status = 'synced' WHERE device_id = %s", (device_id,))
        else:
            cursor.execute("UPDATE devices SET mqtt_username = %s, credential_status = 'active', "
                           "mqtt_sync_status = 'synced', lifecycle_status = 'provisioned' WHERE device_id = %s",
                           (operation["target_username"], device_id))
        audit(cursor, user["user_id"], operation["room_id"], "MQTT_OPERATION_RESULT", device_id,
              {"operation_id": operation_id, "status": status, "steps": steps, "error_code": error_code},
              result="failure" if error_code else "success")
        cursor.execute("SELECT * FROM mqtt_operations WHERE operation_id = %s", (operation_id,))
        result = cursor.fetchone()
    return _public(result)
