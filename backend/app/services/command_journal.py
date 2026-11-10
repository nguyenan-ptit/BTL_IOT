"""Persist controller state and reconcile telemetry without dashboard polling."""
import copy
import threading
import time
from datetime import datetime, timezone

from app.db import device_storage as storage


class JournalController:
    def __init__(self, client):
        self.client = client
        self.lock = threading.Lock()
        self.commands = {}
        self.latest = {}

    def record(self, command, item, command_type, wire, user, timeout):
        storage.create_command(command, item, command_type, wire, user, timeout)

    def dispatch(self, command, user, publish):
        storage.dispatch_command(command, user, publish)

    def reconcile(self, item, now):
        command = self._refresh(item, now)
        if command:
            storage.update_command(command, item["data"])
        return command

    def snapshot(self, item, now=None):
        if item["data"] is None:
            return {"supported": False, "pending": None}
        with self.lock:
            self.latest[item["data"]["device_id"]] = copy.deepcopy(item)
            command = self.reconcile(item, time.monotonic() if now is None else now)
            visible = command and command["room_id"] == item["room_id"]
            return {"supported": self.supported(item["data"]),
                    "pending": self.public(command) if visible else None}

    def observe(self, data):
        with self.lock:
            if data["device_id"] not in self.commands:
                return
            item = dict(self.latest[data["device_id"]])
            item.update(data=copy.deepcopy(data), online=True, age_seconds=0,
                        received_at=datetime.now(timezone.utc).isoformat())
            self.latest[data["device_id"]] = item
            self.reconcile(item, time.monotonic())

    def tick(self):
        with self.lock:
            for item in self.latest.values():
                age = (datetime.now(timezone.utc) - datetime.fromisoformat(item["received_at"])).total_seconds()
                item["age_seconds"] = age
                item["online"] = 0 <= age <= storage.ONLINE_WINDOW_S
                self.reconcile(item, time.monotonic())
