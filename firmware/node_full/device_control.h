#pragma once

#include "threshold_storage.h"
#include "buzzer_test.h"

enum class DeviceCommandKind { THRESHOLDS, OUTPUT_TEST };

// MQTT callbacks only copy bounded input. Flash writes and output commands run
// in the main loop, outside subscribe()/publish() and their callbacks.
class DeviceControl {
 public:
  ThresholdRecord thresholds;
  ThresholdStorage storage;
  BuzzerTestController outputTest;
  bool telemetryDirty = true;

  explicit DeviceControl(ThresholdValues defaults) : thresholds{defaults, 0, ""} {}

  void begin() { storage.begin(thresholds); }

  bool enqueue(DeviceCommandKind kind, const char* bytes, size_t length) {
    if (!bytes || !length || length > THRESHOLD_COMMAND_MAX || count == 2) return false;
    InboxItem& item = inbox[writeIndex];
    item.kind = kind;
    memcpy(item.bytes, bytes, length);
    item.bytes[length] = 0;
    item.length = length;
    writeIndex = (writeIndex + 1) % 2;
    ++count;
    return true;
  }

  // Returns true only after new thresholds have been durably saved and applied.
  bool service(const char* bootId, uint64_t uptimeS, uint32_t now, bool realAlarm) {
    if (!count) return false;
    const InboxItem item = inbox[readIndex];
    readIndex = (readIndex + 1) % 2;
    --count;
    if (item.kind == DeviceCommandKind::OUTPUT_TEST) {
      BuzzerTestCommand command = {};
      if (parseBuzzerTestCommand(item.bytes, item.length, command)
          && outputTest.accept(command, bootId, uptimeS, now, realAlarm)) telemetryDirty = true;
      return false;
    }

    ThresholdCommand command = {};
    if (!parseThresholdCommand(item.bytes, item.length, command)) return false;
    // A duplicate can trigger another telemetry ACK, but must never write flash.
    telemetryDirty = true;
    if (!storage.ready || !canApplyThresholdCommand(command, thresholds, bootId, uptimeS)) return false;
    ThresholdRecord next = {command.values, thresholds.revision + 1, ""};
    strcpy(next.lastRequestId, command.requestId);
    if (!storage.save(next)) return false;
    thresholds = next;
    return true;
  }

  void update(uint32_t now, bool realAlarm) {
    if (outputTest.update(now, realAlarm)) telemetryDirty = true;
  }

  size_t serializeTelemetry(char* output, size_t size, uint32_t now) const {
    StaticJsonDocument<512> document;
    if (storage.ready) {
      JsonObject remote = document.createNestedObject("remote_config");
      remote["version"] = 1;
      remote["revision"] = thresholds.revision;
      remote["last_request_id"] = thresholds.lastRequestId;
    }
    JsonObject test = document.createNestedObject("buzzer_test");
    test["version"] = 2;
    test["command_seq"] = outputTest.commandSeq;
    test["last_request_id"] = outputTest.lastRequestId;
    test["status"] = outputTest.statusName();
    test["active"] = outputTest.active;
    test["remaining_ms"] = outputTest.telemetryRemainingMs(now);
    if (document.overflowed() || measureJson(document) >= size) return 0;
    return serializeJson(document, output, size);
  }

 private:
  struct InboxItem {
    DeviceCommandKind kind = DeviceCommandKind::THRESHOLDS;
    char bytes[THRESHOLD_COMMAND_MAX + 1] = {};
    size_t length = 0;
  };
  InboxItem inbox[2];
  uint8_t readIndex = 0, writeIndex = 0, count = 0;
};
