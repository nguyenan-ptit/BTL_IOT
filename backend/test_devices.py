"""Live smoke tests using real account-service tokens; run only against a test DB."""
import os
import sys
import uuid

import requests

ADMIN_ID, OWNER_ID, TENANT_ID = 1001, 1002, 1003  # IDs in database/test_data.sql
BASE = os.environ.get("IOT_TEST_BASE_URL", "http://127.0.0.1:8000").rstrip("/")
OWN_ROOM = os.environ.get("IOT_TEST_OWN_ROOM", "T-OWN")
OTHER_ROOM = os.environ.get("IOT_TEST_OTHER_ROOM", "101")


def main():
    tokens = {role: os.environ.get("IOT_TEST_" + role.upper() + "_TOKEN") for role in ("admin", "owner", "tenant")}
    if not all(tokens.values()):
        print("Set IOT_TEST_ADMIN_TOKEN, IOT_TEST_OWNER_TOKEN and IOT_TEST_TENANT_TOKEN from the real login service.")
        print("This script never signs tokens or reads JWT_SECRET. Use a separate test database.")
        return 2
    headers = {role: {"Authorization": "Bearer " + token} for role, token in tokens.items()}
    results = []

    def check(name, method, path, expected, *, role=None, body=None):
        response = requests.request(method, BASE + path, headers=headers.get(role, {}), json=body, timeout=15)
        passed = response.status_code == expected
        results.append(passed)
        # Never print tokens, response payloads, passwords or raw network diagnostics.
        print(("PASS" if passed else "FAIL"), name, response.status_code, "expected", expected)
        return response

    suffix = uuid.uuid4().hex[:10]
    first, second = "TA" + suffix, "TB" + suffix

    def registration(device, room):
        return {"device_id": device, "device_name": device, "room_id": room, "mqtt_username": "ref_" + device}

    try:
        check("No token", "GET", "/api/devices", 401)
        check("Tenant cannot register", "POST", "/api/devices/register", 403, role="tenant", body=registration(first, OWN_ROOM))
        check("Admin registration", "POST", "/api/devices/register", 201, role="admin", body=registration(first, OWN_ROOM))
        check("Duplicate identity", "POST", "/api/devices/register", 409, role="admin", body=registration(first, OWN_ROOM))
        check("Owner own room", "POST", "/api/devices/register", 201, role="owner", body=registration(second, OWN_ROOM))
        check("Owner other room", "POST", "/api/devices/register", 403, role="owner", body=registration("TX" + suffix, OTHER_ROOM))
        check("Never-seen device readable", "GET", "/api/devices/" + first, 200, role="admin")
        check("No DB-only credential activation", "PATCH", "/api/devices/" + first + "/lifecycle", 409,
              role="admin", body={"credential_status": "active"})
        check("Cannot skip provisioning", "PATCH", "/api/devices/" + first + "/lifecycle", 409,
              role="admin", body={"lifecycle_status": "active"})
        check("Update versions", "PATCH", "/api/devices/" + first, 200, role="admin",
              body={"hardware_version": "smoke-board", "firmware_version": "smoke-v6"})
        check("Missing time zone", "GET", "/api/history?device_id=" + first + "&from=2026-11-06T00:00:00", 422, role="admin")
        check("Persistent command history", "GET", "/api/devices/" + first + "/commands", 200, role="admin")
    except requests.RequestException:
        print("FAIL network request; check the test server and its configuration.")
        return 1
    print(sum(results), "/", len(results), "PASS")
    print("Test device IDs retained for inspection:", first, second)
    print("MQTT credentials, real ESP ACKs and physical outputs require the deployment acceptance steps in docs/LONG_API.md.")
    return 0 if all(results) else 1


if __name__ == "__main__":
    sys.exit(main())
