"""Load local settings without importing/executing the old receiver."""
import ast
import json
import os
from pathlib import Path
from urllib.parse import urlsplit

# Keep settings.local.json, settings.example.json, and relative config paths at backend/.
HERE = Path(__file__).resolve().parents[2]


def legacy_credentials(path):
    # Parse only literal arguments; never execute the old script or log its contents.
    tree = ast.parse(Path(path).read_text(encoding="utf-8-sig"))
    for node in ast.walk(tree):
        if (isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute)
                and node.func.attr == "username_pw_set" and len(node.args) >= 2):
            user, password = (ast.literal_eval(arg) for arg in node.args[:2])
            if isinstance(user, str) and isinstance(password, str):
                return user, password
    return None


def load_settings():
    requested = os.environ.get("IOT_FULL_SETTINGS")
    path = Path(requested) if requested else HERE / "settings.local.json"
    if not path.exists():
        if requested:
            raise ValueError("Không tìm thấy file IOT_FULL_SETTINGS")
        path = HERE / "settings.example.json"
    config = json.loads(path.read_text(encoding="utf-8-sig"))
    if config.get("use_legacy_mqtt_credentials") and not config.get("mqtt_password"):
        try:
            pair = legacy_credentials(config["legacy_receiver"])
        except (OSError, ValueError, SyntaxError, KeyError, TypeError):
            pair = None
        if pair:
            config["mqtt_username"], config["mqtt_password"] = pair
    # Environment values take priority. Do not expose config through API/logs.
    for key in ("mqtt_host", "mqtt_username", "mqtt_password"):
        config[key] = os.environ.get("IOT_" + key.upper(), config.get(key, ""))
    if not isinstance(config.get("mqtt_host"), str) or not config["mqtt_host"]:
        raise ValueError("Thiếu địa chỉ MQTT")
    if type(config.get("mqtt_port")) is not int or not 1 <= config["mqtt_port"] <= 65535:
        raise ValueError("MQTT port không hợp lệ")
    if config.get("mqtt_topic") != "iot/devices/+/telemetry":
        raise ValueError("mqtt_topic phải là iot/devices/+/telemetry; cập nhật cấu hình trước khi chạy lại")
    mqtt_tls = config.get("mqtt_tls", False)
    if type(mqtt_tls) is not bool:
        raise ValueError("mqtt_tls phải là true hoặc false")
    config["mqtt_tls"] = mqtt_tls
    ca_path = config.get("mqtt_ca_certs", "")
    if mqtt_tls:
        if not isinstance(ca_path, str) or not ca_path.strip() or "\0" in ca_path:
            raise ValueError("Khi bật mqtt_tls, mqtt_ca_certs phải trỏ tới file CA")
        ca_path = Path(ca_path)
        if not ca_path.is_absolute():
            ca_path = path.parent / ca_path
        if not ca_path.is_file():
            raise ValueError("Không tìm thấy file CA MQTT đã cấu hình")
        config["mqtt_ca_certs"] = str(ca_path)
    else:
        config["mqtt_ca_certs"] = None
    discovery_enabled = config.get("discovery_enabled", False)
    if type(discovery_enabled) is not bool:
        raise ValueError("discovery_enabled phải là true hoặc false")
    config["discovery_enabled"] = discovery_enabled
    discovery_key = config.get("discovery_key_path", "discovery.key")
    if not isinstance(discovery_key, str) or not discovery_key.strip() or "\0" in discovery_key:
        raise ValueError("Đường dẫn khóa tìm MQTT không hợp lệ")
    discovery_key = Path(discovery_key)
    config["discovery_key_path"] = discovery_key if discovery_key.is_absolute() else HERE / discovery_key
    config["mysql"] = _load_mysql(config.get("mysql"))
    if config["mysql"].get("ssl_ca"):
        mysql_ca = Path(config["mysql"]["ssl_ca"])
        if not mysql_ca.is_absolute():
            mysql_ca = path.parent / mysql_ca
        if not mysql_ca.is_file():
            raise ValueError("Không tìm thấy CA MySQL")
        config["mysql"]["ssl_ca"] = str(mysql_ca)
    config["emqx_admin"] = _load_emqx(config.get("emqx_admin", {}), path.parent)
    return config


def _load_mysql(block):
    """Validate the `mysql` block. Environment variables override the file so the
    password can stay out of settings files (IOT_MYSQL_PASSWORD)."""
    if not isinstance(block, dict):
        raise ValueError("Thiếu khối mysql trong cấu hình")
    mysql = dict(block)
    for key in ("host", "user", "password", "database"):
        mysql[key] = os.environ.get("IOT_MYSQL_" + key.upper(), mysql.get(key, ""))
    env_port = os.environ.get("IOT_MYSQL_PORT")
    if env_port is not None:
        try:
            mysql["port"] = int(env_port)
        except ValueError:
            raise ValueError("IOT_MYSQL_PORT phải là số nguyên") from None
    for key in ("host", "user", "database"):
        if not isinstance(mysql[key], str) or not mysql[key].strip():
            raise ValueError(f"mysql.{key} không hợp lệ")
    if not isinstance(mysql["password"], str) or not mysql["password"]:
        raise ValueError("Thiếu mật khẩu MySQL; đặt mysql.password trong settings.local.json hoặc biến IOT_MYSQL_PASSWORD")
    if type(mysql.get("port")) is not int or not 1 <= mysql["port"] <= 65535:
        raise ValueError("mysql.port không hợp lệ")
    mysql["ssl_ca"] = os.environ.get("IOT_MYSQL_SSL_CA", mysql.get("ssl_ca"))
    if mysql["ssl_ca"] is not None and (not isinstance(mysql["ssl_ca"], str) or not mysql["ssl_ca"].strip()):
        raise ValueError("mysql.ssl_ca không hợp lệ")
    return {k: mysql[k] for k in ("host", "port", "user", "password", "database", "ssl_ca")}


def _load_emqx(block, directory):
    if not isinstance(block, dict):
        raise ValueError("emqx_admin phải là object")
    config = dict(block)
    for key, env in (("base_url", "API_URL"), ("api_key", "API_KEY"),
                     ("api_secret", "API_SECRET"), ("deployment", "DEPLOYMENT")):
        config[key] = os.environ.get("IOT_EMQX_" + env, config.get(key, "disabled" if key == "deployment" else ""))
        if not isinstance(config[key], str):
            raise ValueError("emqx_admin." + key + " phải là chuỗi")
    if config["deployment"] not in ("disabled", "serverless", "emqx5"):
        raise ValueError("emqx_admin.deployment phải là disabled, serverless hoặc emqx5")
    verified = os.environ.get("IOT_EMQX_POLICY_VERIFIED")
    if verified is not None:
        if verified.lower() not in ("true", "false"):
            raise ValueError("IOT_EMQX_POLICY_VERIFIED phải là true hoặc false")
        config["policy_verified"] = verified.lower() == "true"
    config.setdefault("policy_verified", False)
    if type(config["policy_verified"]) is not bool:
        raise ValueError("emqx_admin.policy_verified phải là boolean")
    if config["base_url"]:
        try:
            url = urlsplit(config["base_url"])
            valid = (url.hostname and not url.username and not url.password and not url.query and not url.fragment
                     and (url.scheme == "https" or (url.scheme == "http" and url.hostname in ("localhost", "127.0.0.1", "::1"))))
        except (TypeError, ValueError):
            valid = False
        if not valid:
            raise ValueError("URL quản trị EMQX phải dùng HTTPS (HTTP chỉ cho loopback), không chứa thông tin đăng nhập")
    timeout = config.get("timeout_s", 5)
    if type(timeout) not in (int, float) or not 1 <= timeout <= 15:
        raise ValueError("emqx_admin.timeout_s phải từ 1 đến 15")
    config["timeout_s"] = timeout
    legacy = config.get("legacy_node_usernames", {})
    if not isinstance(legacy, dict) or any(not isinstance(key, str) or not isinstance(value, (str, list))
                                          or (isinstance(value, list) and any(not isinstance(name, str) for name in value))
                                          for key, value in legacy.items()):
        raise ValueError("emqx_admin.legacy_node_usernames phải là ánh xạ device_id sang username hoặc danh sách username")
    ca = config.get("ca_file")
    if ca:
        ca = Path(ca)
        ca = ca if ca.is_absolute() else directory / ca
        if not ca.is_file():
            raise ValueError("Không tìm thấy CA API EMQX")
        config["ca_file"] = str(ca)
    return config
