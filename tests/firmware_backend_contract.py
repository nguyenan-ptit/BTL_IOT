"""Send real backend commands through the native firmware control implementation.

Usage: python tests/firmware_backend_contract.py /path/to/firmware_device_control
Requires FastAPI, Pydantic and paho-mqtt. Only the DB journal and MQTT transport are
replaced; backend validation, command generation and ACK reconciliation run as-is.
"""
import copy
import json
from pathlib import Path
import subprocess
import sys
import time
from types import ModuleType, SimpleNamespace
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))
# This test never opens a database; avoid importing its optional MySQL driver.
storage_stub = ModuleType("app.db.device_storage")
storage_stub.update_command = lambda *args: None
with patch.dict(sys.modules, {"app.db.device_storage": storage_stub}):
    from app.integrations.mqtt.remote_control import RemoteController, ThresholdUpdate
    from app.integrations.mqtt.buzzer_control import BuzzerController, BuzzerTestUpdate
from app.services.telemetry_validation import validate_message

BINARY = sys.argv.pop(1)


class FirmwareContract(unittest.TestCase):
    def setUp(self):
        self.firmware = subprocess.Popen([BINARY, "--bridge"], stdin=subprocess.PIPE,
                                         stdout=subprocess.PIPE, text=True)
        self.addCleanup(self.close_firmware)
        self.data = json.loads((ROOT / "examples/telemetry-normal.json").read_text())
        self.data["uptime_s"] = 100
        self.last_report = self.exchange("state")

    def close_firmware(self):
        self.firmware.stdin.close()
        try:
            self.firmware.wait(timeout=5)
        finally:
            self.firmware.stdout.close()

    def exchange(self, wire):
        self.firmware.stdin.write(wire + "\n")
        self.firmware.stdin.flush()
        line = self.firmware.stdout.readline()
        self.assertTrue(line, "Native firmware exited before reporting telemetry")
        return json.loads(line)

    def publish(self, topic, payload, qos, retain):
        self.assertEqual(qos, 1)
        self.assertFalse(retain)
        prefix = "t|" if topic.endswith("/config/set") else "b|"
        self.assertEqual(topic, "iot/devices/" + self.data["device_id"] +
                         ("/config/set" if prefix == "t|" else "/buzzer/test"))
        self.last_report = self.exchange(prefix + payload)
        return SimpleNamespace(rc=0)

    def telemetry(self, report):
        data = copy.deepcopy(self.data)
        for key, value in report.items():
            if key in ("mq2", "limits"):
                data[key].update(value)
            else:
                data[key] = value
        return validate_message(json.dumps(data).encode())

    def item(self, data=None):
        return {"data": data or self.data, "online": True, "age_seconds": 0, "room_id": 1}

    def submit(self, controller, body):
        # Database access is outside this wire-contract test.
        with patch.object(controller, "record"), patch.object(
                controller, "dispatch", side_effect=lambda command, user, send: send()):
            return controller.submit(self.item(), body, True, {"user_id": 1})

    def test_threshold_ack_and_reboot(self):
        client = SimpleNamespace(is_connected=lambda: True, publish=self.publish)
        controller = RemoteController(client)
        body = ThresholdUpdate(expected_boot_id=self.data["boot_id"], expected_revision=0,
                               thresholds={"mq2_on": 80, "mq2_off": 70,
                                           "temperature_on_c": 65.5, "temperature_off_c": 60.5})
        self.assertEqual(self.submit(controller, body)["status"], "pending")
        data = self.telemetry(self.last_report)
        self.assertEqual(controller._refresh(self.item(data), time.monotonic())["status"], "applied")
        rebooted = self.telemetry(self.exchange("reboot"))
        rebooted["boot_id"] = "fedcba9876543210"
        self.assertEqual(rebooted["remote_config"], data["remote_config"])
        self.assertEqual(rebooted["limits"], data["limits"])
        controller.commands[self.data["device_id"]]["status"] = "pending"
        self.assertEqual(controller._refresh(self.item(rebooted), time.monotonic())["status"], "applied")

    def test_output_start_complete_and_stop(self):
        client = SimpleNamespace(is_connected=lambda: True, publish=self.publish)
        controller = BuzzerController(client)
        body = BuzzerTestUpdate(expected_boot_id=self.data["boot_id"], expected_seq=0, action="start")
        self.assertEqual(self.submit(controller, body)["status"], "pending")
        running = self.telemetry(self.last_report)
        self.assertEqual(controller._refresh(self.item(running), time.monotonic())["status"], "running")
        completed = self.telemetry(self.exchange("complete"))
        self.assertEqual(controller._refresh(self.item(completed), time.monotonic())["status"], "completed")
        self.data = completed
        body = BuzzerTestUpdate(expected_boot_id=self.data["boot_id"], expected_seq=1, action="start")
        self.submit(controller, body)
        self.data = self.telemetry(self.last_report)
        controller._refresh(self.item(), time.monotonic())
        body = BuzzerTestUpdate(expected_boot_id=self.data["boot_id"], expected_seq=2, action="stop")
        self.submit(controller, body)
        stopped = self.telemetry(self.last_report)
        self.assertEqual(controller._refresh(self.item(stopped), time.monotonic())["status"], "stopped")


if __name__ == "__main__":
    unittest.main()
