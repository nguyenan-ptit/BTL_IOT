import logging
import os
import threading
from contextlib import asynccontextmanager

from app.core.config import settings
from app.core.legacy_settings import load_settings
from app.db.device_storage import (StorageError, backend_guard, configure as configure_storage,
                                   expire_commands, initialize, recover_commands)
from app.integrations.emqx.admin import EmqxAdmin
from app.integrations.mqtt.buzzer_control import BuzzerController
from app.integrations.mqtt.discovery import DiscoveryResponder
from app.integrations.mqtt.receiver import Receiver
from app.integrations.mqtt.remote_control import RemoteController
from app.services.ota import OtaController

logger = logging.getLogger("iot_full")


class OtaAccessLogFilter(logging.Filter):
    def filter(self, record):
        # Uvicorn access arguments include the request target, including query parameters.
        args = record.args
        if isinstance(args, tuple) and len(args) == 5 and isinstance(args[2], str):
            if args[2].startswith("/api/ota/download/"):
                record.args = (*args[:2], args[2].split("?", 1)[0], *args[3:])
        return True


@asynccontextmanager
async def lifespan(app):
    config = load_settings()
    if len(settings.jwt_secret_key) < 32:
        raise ValueError("Cần JWT_SECRET ít nhất 32 ký tự từ dịch vụ tài khoản")
    # The legacy device API verifier reads this environment variable directly.
    os.environ["JWT_SECRET"] = settings.jwt_secret_key
    configure_storage(config["mysql"])
    with backend_guard() as guard:
        initialize()
        recover_commands()
        app.state.config = config
        app.state.receiver = Receiver(config)
        app.state.ota = OtaController(app.state.receiver.client, settings.ota_public_origin,
                                      settings.ota_public_key, settings.jwt_secret_key)
        app.state.ota.check_schema()
        access_logger = logging.getLogger("uvicorn.access")
        access_filter = OtaAccessLogFilter()
        if app.state.ota.enabled:
            app.state.receiver.on_ota_status = app.state.ota.observe
            access_logger.addFilter(access_filter)
        app.state.remote_control = RemoteController(app.state.receiver.client)
        app.state.buzzer_control = BuzzerController(app.state.receiver.client)
        app.state.emqx_admin = EmqxAdmin({**config["emqx_admin"],
                                          "protected_usernames": [config.get("mqtt_username")]})
        app.state.command_worker_ready = True
        controllers = (app.state.remote_control, app.state.buzzer_control)

        def observe(data):
            for controller in controllers:
                try:
                    controller.observe(data)
                except StorageError:
                    logger.error("Cannot persist command acknowledgement; will retry")

        app.state.receiver.on_accepted = observe
        stop_worker = threading.Event()

        def reconcile_timeouts():
            while not stop_worker.wait(1):
                try:
                    guard.execute("SELECT 1")
                except Exception:
                    app.state.command_worker_ready = False
                    logger.error("Backend database lease lost; stopping MQTT ingestion and control")
                    app.state.receiver.stop()
                    return
                for controller in controllers:
                    try:
                        controller.tick()
                    except Exception as exc:
                        logger.error("Command worker error: %s", type(exc).__name__)
                try:
                    expire_commands()
                except StorageError:
                    logger.error("Cannot expire untracked commands; will retry")
                try:
                    broker = app.state.receiver.snapshot()
                    app.state.ota.tick(broker["connected"] and broker.get("ota_connected", False))
                except Exception as exc:
                    logger.error("OTA worker error: %s", type(exc).__name__)

        worker = threading.Thread(target=reconcile_timeouts, name="command-journal", daemon=True)
        app.state.discovery = DiscoveryResponder(config, lambda: app.state.receiver.snapshot()["connected"])
        try:
            app.state.receiver.start()
            app.state.discovery.start()
            worker.start()
            yield
        finally:
            stop_worker.set()
            access_logger.removeFilter(access_filter)
            app.state.discovery.stop()
            app.state.receiver.stop()
            if worker.ident is not None:
                worker.join(timeout=35)
            app.state.command_worker_ready = False

