"""Documented EMQX v5 built-in authentication/authorization API adapter.

Cloud Serverless is deliberately unsupported for credential automation: its published
API does not expose these resources. Never use private Cloud console endpoints.
"""
from urllib.parse import quote

import requests

USERS = "/authentication/password_based:built_in_database/users"
RULES = "/authorization/sources/built_in_database/rules/users"
CLIENT_RULES = "/authorization/sources/built_in_database/rules/clients"
DENY_RULES = [{"permission": "deny", "action": "all", "topic": topic} for topic in ("#", "$SYS/#")]


class AdminError(Exception):
    def __init__(self, code):
        super().__init__(code)
        self.code = code


class EmqxAdmin:
    def __init__(self, config):
        self.config = config

    def _request(self, method, path, *, body=None, params=None, missing_ok=False):
        if not self.config.get("base_url") or not self.config.get("api_key") or not self.config.get("api_secret"):
            raise AdminError("emqx_not_configured")
        try:
            response = requests.request(
                method, self.config["base_url"].rstrip("/") + path,
                auth=(self.config["api_key"], self.config["api_secret"]), json=body, params=params,
                timeout=(3, self.config.get("timeout_s", 5)),
                verify=self.config.get("ca_file") or True, allow_redirects=False)
            if response.status_code == 404 and missing_ok:
                return None
            if response.status_code not in (200, 201, 204):
                # Never include request URLs, credentials, response bodies or exception text.
                raise AdminError("emqx_http_" + str(response.status_code))
            return response.json() if response.content else {}
        except (requests.RequestException, ValueError):
            raise AdminError("emqx_unavailable_or_invalid_response") from None

    def check(self):
        if self.config.get("deployment") != "emqx5":
            raise AdminError("emqx_credential_api_unsupported")
        for path in (USERS, RULES, "/clients"):
            result = self._request("GET", path, params={"limit": 1})
            if not isinstance(result, dict) or not isinstance(result.get("data"), list):
                raise AdminError("emqx_invalid_capability_response")
        result = self._request("GET", CLIENT_RULES, params={"limit": 1})
        if not isinstance(result, dict) or not isinstance(result.get("data"), list):
            raise AdminError("emqx_invalid_capability_response")
        if result["data"]:
            raise AdminError("emqx_client_rules_override_policy")
        if not self.config.get("policy_verified"):
            raise AdminError("emqx_authentication_policy_unverified")

    def ensure_node_usernames(self, usernames):
        if any(username in self.config.get("protected_usernames", []) for username in usernames):
            raise AdminError("emqx_protected_backend_account")

    def validate_device_identities(self, device_id, usernames, managed_usernames):
        legacy = self.config.get("legacy_node_usernames", {}).get(device_id, [])
        if isinstance(legacy, str):
            legacy = [legacy]
        trusted = set(managed_usernames) | set(legacy)
        for username in usernames:
            if username not in trusted:
                existing = self._request("GET", USERS + "/" + quote(username, safe=""), missing_ok=True)
                if existing is not None or self.clients(username):
                    raise AdminError("emqx_legacy_identity_unverified")

    def capabilities(self):
        try:
            self.check()
        except AdminError as exc:
            return {"credential_automation_ready": False, "error_code": exc.code,
                    "write_permissions_verified": False}
        return {"credential_automation_ready": True, "read_checks_passed": True,
                "write_permissions_verified": False,
                "note": "Quyền ghi được kiểm tra bằng kết quả từng thao tác; cần nghiệm thu trên deployment thật."}

    def set_rules(self, username, rules):
        path = RULES + "/" + quote(username, safe="")
        existing = self._request("GET", path, missing_ok=True)
        body = {"username": username, "rules": rules}
        if existing is None:
            self._request("POST", RULES, body=[body])
        else:
            self._request("PUT", path, body=body)

    def deny(self, username):
        self.set_rules(username, DENY_RULES)

    def allow_device(self, username, device_id):
        prefix = "iot/devices/" + device_id
        rules = [{"permission": "allow", "action": action, "topic": prefix + suffix}
                 for action, suffix in (("publish", "/telemetry"), ("subscribe", "/config/set"),
                                        ("subscribe", "/buzzer/test"))]
        self.set_rules(username, rules + DENY_RULES)

    def put_user(self, username, password):
        path = USERS + "/" + quote(username, safe="")
        existing = self._request("GET", path, missing_ok=True)
        body = {"password": password, "is_superuser": False}
        if existing is None:
            self._request("POST", USERS, body={"user_id": username, **body})
        else:
            self._request("PUT", path, body=body)

    def delete_user(self, username):
        self._request("DELETE", USERS + "/" + quote(username, safe=""), missing_ok=True)

    def clients(self, username):
        clients = []
        for page in range(1, 101):
            result = self._request("GET", "/clients", params={"username": username, "page": page, "limit": 100})
            if not isinstance(result, dict) or not isinstance(result.get("data"), list):
                raise AdminError("emqx_invalid_clients_response")
            rows = result["data"]
            for client in rows:
                if (not isinstance(client, dict) or not isinstance(client.get("clientid"), str)
                        or "username" not in client
                        or (client["username"] is not None and not isinstance(client["username"], str))):
                    raise AdminError("emqx_invalid_clients_response")
                if client.get("username") == username:
                    clients.append(client["clientid"])
            more = result.get("meta", {}).get("hasnext")
            if more is False or (more is None and len(rows) < 100):
                return clients
        raise AdminError("emqx_client_pagination_limit")

    def disconnect(self, username):
        for _ in range(3):
            clients = self.clients(username)
            if not clients:
                return
            for client_id in clients:
                path = "/clients/" + quote(client_id, safe="")
                current = self._request("GET", path, missing_ok=True)
                if current is not None and (not isinstance(current, dict) or "username" not in current):
                    raise AdminError("emqx_invalid_client_response")
                if current and current.get("username") == username:
                    self._request("DELETE", path, missing_ok=True)
        if self.clients(username):
            raise AdminError("emqx_sessions_not_disconnected")
