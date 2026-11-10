// Integration of the actual MQTT inbox, durable threshold updates and output
// control. Uses the in-memory filesystem; never contacts a broker or ESP.
#include <cassert>
#include <iostream>
#include <string>
#include "../firmware/node_full/device_control.h"

static const char* BOOT = "0123456789abcdef";
static const char* REQUEST = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
static const ThresholdValues DEFAULTS = {60, 55, 600, 550};

std::string thresholds(unsigned revision = 0) {
  return std::string("{\"request_id\":\"") + REQUEST + "\",\"boot_id\":\"" + BOOT +
      "\",\"expected_revision\":" + std::to_string(revision) +
      ",\"expires_uptime_s\":120,\"thresholds\":{\"mq2_on\":80,\"mq2_off\":70,"
      "\"temperature_on_c\":65.5,\"temperature_off_c\":60.5}}";
}

std::string outputCommand(bool start = true, unsigned seq = 0,
                          const char* id = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb") {
  return std::string("{\"request_id\":\"") + id + "\",\"boot_id\":\"" + BOOT +
      "\",\"expected_seq\":" + std::to_string(seq) +
      ",\"expires_uptime_s\":120,\"action\":\"" + (start ? "start" : "stop") + "\"}";
}

bool queue(DeviceControl& control, DeviceCommandKind kind, const std::string& wire) {
  return control.enqueue(kind, wire.data(), wire.size());
}

std::string report(const DeviceControl& control, uint32_t now) {
  char bytes[384];
  const size_t size = control.serializeTelemetry(bytes, sizeof(bytes), now);
  assert(size);
  return std::string(bytes, size);
}

int main(int argc, char** argv) {
  // Line-based bridge for tests/firmware_backend_contract.py: execute the
  // backend's exact wire JSON and return firmware-generated control metadata.
  if (argc == 2 && std::string(argv[1]) == "--bridge") {
    DeviceControl control(DEFAULTS);
    control.begin();
    std::string line;
    while (std::getline(std::cin, line)) {
      if (line == "reboot") {
        control = DeviceControl(DEFAULTS);
        control.begin();
      } else if (line == "state") {
        // Return the initial capabilities without accepting a command.
      } else if (line == "complete") {
        control.update(4000, false);
      } else {
        assert(line.size() > 2 && line[1] == '|');
        const DeviceCommandKind kind = line[0] == 't'
            ? DeviceCommandKind::THRESHOLDS : DeviceCommandKind::OUTPUT_TEST;
        assert(queue(control, kind, line.substr(2)));
        control.service(BOOT, 100, 1000, false);
      }
      StaticJsonDocument<768> snapshot;
      assert(!deserializeJson(snapshot, report(control, 1000)));
      JsonObject mq = snapshot.createNestedObject("mq2");
      mq["adc_on"] = control.thresholds.values.mq2On;
      mq["adc_off"] = control.thresholds.values.mq2Off;
      JsonObject limits = snapshot.createNestedObject("limits");
      limits["temperature_on_c"] = control.thresholds.values.temperatureOnTenths / 10.0;
      limits["temperature_off_c"] = control.thresholds.values.temperatureOffTenths / 10.0;
      const auto outputs = selectDeviceOutputs(SystemState::NORMAL, control.outputTest.active, 1000);
      snapshot["led"] = outputs.ledName;
      snapshot["buzzer_cmd"] = outputs.buzzerOn;
      std::string bytes;
      serializeJson(snapshot, bytes);
      std::cout << bytes << std::endl;
    }
    return 0;
  }

  unsigned cases = 0;
  DeviceControl control(DEFAULTS);
  control.begin();
  assert(control.storage.ready && control.thresholds.revision == 0); ++cases;
  const auto wire = thresholds();
  assert(queue(control, DeviceCommandKind::THRESHOLDS, wire)); ++cases;
  assert(control.thresholds.revision == 0 && fakeStorage.files.empty()); ++cases;
  assert(control.service(BOOT, 100, 1000, false)); ++cases;
  assert(control.thresholds.revision == 1 && control.thresholds.values.temperatureOnTenths == 655
      && std::string(control.thresholds.lastRequestId) == REQUEST); ++cases;
  const auto committed = fakeStorage.files;
  assert(queue(control, DeviceCommandKind::THRESHOLDS, wire)); ++cases;
  assert(!control.service(BOOT, 100, 1100, false) && fakeStorage.files == committed); ++cases;
  DeviceControl reboot(DEFAULTS);
  reboot.begin();
  assert(reboot.thresholds.revision == 1
      && sameThresholdValues(reboot.thresholds.values, control.thresholds.values)); ++cases;
  StaticJsonDocument<512> metadata;
  assert(!deserializeJson(metadata, report(reboot, 1200))); ++cases;
  assert(metadata["remote_config"]["version"] == 1
      && metadata["remote_config"]["revision"] == 1
      && metadata["buzzer_test"]["version"] == 2); ++cases;

  fakeStorage = FakeStorageState();
  DeviceControl failure(DEFAULTS);
  failure.begin();
  fakeStorage.failWrite = true;
  assert(queue(failure, DeviceCommandKind::THRESHOLDS, wire)); ++cases;
  assert(!failure.service(BOOT, 100, 1000, false) && failure.thresholds.revision == 0
      && sameThresholdValues(failure.thresholds.values, DEFAULTS)); ++cases;
  fakeStorage.failWrite = false;
  assert(queue(failure, DeviceCommandKind::THRESHOLDS, wire)); ++cases;
  assert(!failure.service("ffffffffffffffff", 100, 1000, false)); ++cases;
  assert(queue(failure, DeviceCommandKind::THRESHOLDS, wire)); ++cases;
  assert(!failure.service(BOOT, 120, 1000, false)); ++cases;
  assert(!failure.enqueue(DeviceCommandKind::THRESHOLDS, wire.data(), 513)); ++cases;
  assert(!failure.enqueue(DeviceCommandKind::THRESHOLDS, nullptr, 1)); ++cases;
  assert(queue(failure, DeviceCommandKind::THRESHOLDS, "{}")); ++cases;
  assert(queue(failure, DeviceCommandKind::THRESHOLDS, "{}")); ++cases;
  assert(!queue(failure, DeviceCommandKind::THRESHOLDS, wire)); ++cases;
  assert(!failure.service(BOOT, 100, 1000, false)); ++cases;
  assert(!failure.service(BOOT, 100, 1000, false)); ++cases;

  const auto start = outputCommand();
  assert(queue(failure, DeviceCommandKind::OUTPUT_TEST, start)); ++cases;
  assert(!failure.service(BOOT, 100, 1000, false) && failure.outputTest.active); ++cases;
  assert(selectDeviceOutputs(SystemState::FAULT, failure.outputTest.active, 1000).buzzerOn); ++cases;
  failure.update(3999, false);
  assert(failure.outputTest.active); ++cases;
  failure.update(4000, false);
  assert(!failure.outputTest.active && failure.outputTest.status == BuzzerTestStatus::COMPLETED); ++cases;
  assert(queue(failure, DeviceCommandKind::OUTPUT_TEST, start)); ++cases;
  failure.service(BOOT, 100, 4000, false);
  assert(!failure.outputTest.active && failure.outputTest.commandSeq == 1); ++cases;
  assert(queue(failure, DeviceCommandKind::OUTPUT_TEST, outputCommand(true, 1, REQUEST))); ++cases;
  failure.service(BOOT, 100, 5000, true);
  assert(failure.outputTest.status == BuzzerTestStatus::BLOCKED && !failure.outputTest.active); ++cases;
  assert(selectDeviceOutputs(SystemState::ALARM, false, 5000).buzzerOn); ++cases;

  fakeStorage = FakeStorageState();
  fakeStorage.files["/threshold0.json"] = "corrupt";
  DeviceControl unavailable(DEFAULTS);
  unavailable.begin();
  assert(!deserializeJson(metadata, report(unavailable, 0))); ++cases;
  assert(!metadata.containsKey("remote_config") && metadata.containsKey("buzzer_test")); ++cases;
  assert(queue(unavailable, DeviceCommandKind::THRESHOLDS, wire)); ++cases;
  assert(!unavailable.service(BOOT, 100, 1000, false) && unavailable.thresholds.revision == 0); ++cases;
  std::cout << "PASS: " << cases << " device inbox/persistence/telemetry/output integration checks\n";
}
