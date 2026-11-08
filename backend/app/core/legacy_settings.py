"""Load local settings without importing/executing the old receiver."""
import json
import os
from pathlib import Path
from urllib.parse import urlsplit
from app.core.config import settings

# Keep settings.local.json, settings.example.json, and relative config paths at backend/.
HERE = Path(__file__).resolve().parents[2]


def load_settings():
    requested = os.environ.get("IOT_FULL_SETTINGS")
    path = Path(requested) if requested else HERE / "settings.local.json"
    if not path.exists():
        if requested:
            raise ValueError("Không tìm thấy file IOT_FULL_SETTINGS")
        path = HERE / "settings.example.json"
    config = json.loads(path.read_text(encoding="utf-8-sig"))
    # MQTT credentials are read through shared Settings so values in .env work too.
    if settings.mqtt_host:
        config["mqtt_host"] = settings.mqtt_host
    config["mqtt_username"] = settings.mqtt_username
    config["mqtt_password"] = settings.mqtt_password
    if not settings.mqtt_host:
        config["mqtt_host"] = os.environ.get("IOT_MQTT_HOST", config.get("mqtt_host", ""))
    # Do not expose config through API/logs.
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
    # MySQL is configured only through the shared Pydantic settings/.env source.
    config["mysql"] = settings.mysql_config
    config["emqx_admin"] = _load_emqx(config.get("emqx_admin", {}), path.parent)
    return config


def _load_emqx(block, directory):
    if not isinstance(block, dict):
        raise ValueError("emqx_admin phải là object")
    config = dict(block)
    overrides = {
        "base_url": settings.emqx_api_url,
        "api_key": settings.emqx_api_key,
        "api_secret": settings.emqx_api_secret,
        "deployment": settings.emqx_deployment,
    }
    env_names = {"base_url": "IOT_EMQX_API_URL", "api_key": "IOT_EMQX_API_KEY",
                 "api_secret": "IOT_EMQX_API_SECRET", "deployment": "IOT_EMQX_DEPLOYMENT"}
    for key in ("base_url", "api_key", "api_secret", "deployment"):
        configured = overrides[key]
        if configured is None:
            configured = os.environ.get(env_names[key])
        config[key] = configured if configured is not None else config.get(key, "disabled" if key == "deployment" else "")
        if not isinstance(config[key], str):
            raise ValueError("emqx_admin." + key + " phải là chuỗi")
    if config["deployment"] not in ("disabled", "serverless", "emqx5"):
        raise ValueError("emqx_admin.deployment phải là disabled, serverless hoặc emqx5")
    verified = settings.emqx_policy_verified
    if verified is not None:
        config["policy_verified"] = verified
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
