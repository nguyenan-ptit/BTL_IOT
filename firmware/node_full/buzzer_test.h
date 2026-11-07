#pragma once

#include "remote_thresholds.h"
#include "alarm_policy.h"

constexpr uint32_t BUZZER_TEST_DURATION_MS = 3000;

struct DeviceOutputSelection {
  bool redHigh;
  bool greenHigh;
  bool buzzerOn;
  const char* ledName;
};

// A manual test overrides only the physical outputs, never sensor alarm/state.
// Selecting afresh on every loop restores the CURRENT sensor state after stop,
// timeout or a real alarm; no stale pre-test LED colour is saved or replayed.
inline DeviceOutputSelection selectDeviceOutputs(SystemState sensorState,
                                                 bool manualTestActive, uint32_t now) {
  if (sensorState == SystemState::ALARM || manualTestActive)
    return {(now / 250) % 2 == 0, false, true, "red_blink"};
  if (sensorState == SystemState::FAULT)
    return {true, true, false, "yellow"};
  return {false, true, false, "green"};
}

struct BuzzerTestCommand {
  char requestId[33];
  char bootId[17];
  uint32_t expectedSeq;
  uint64_t expiresUptimeS;
  bool start;
};

inline bool parseBuzzerTestCommand(const char* raw, size_t length, BuzzerTestCommand& result) {
  static const char* const keys[] = {"request_id", "boot_id", "expected_seq", "expires_uptime_s", "action"};
  if (!thresholdJsonEnvelope(raw, length, keys, 5)) return false;
  StaticJsonDocument<512> document;
  if (deserializeJson(document, raw, length, DeserializationOption::NestingLimit(2))) return false;
  const JsonObjectConst object = document.as<JsonObjectConst>();
  if (object.size() != 5 || !object["request_id"].is<const char*>() ||
      !object["boot_id"].is<const char*>() || !thresholdHex(object["request_id"], 32) ||
      !thresholdHex(object["boot_id"], 16) || !object["expected_seq"].is<uint32_t>() ||
      !object["expires_uptime_s"].is<uint64_t>() || !object["action"].is<const char*>()) return false;
  const char* action = object["action"].as<const char*>();
  if (strcmp(action, "start") != 0 && strcmp(action, "stop") != 0) return false;
  BuzzerTestCommand candidate = {};
  strcpy(candidate.requestId, object["request_id"].as<const char*>());
  strcpy(candidate.bootId, object["boot_id"].as<const char*>());
  candidate.expectedSeq = object["expected_seq"].as<uint32_t>();
  candidate.expiresUptimeS = object["expires_uptime_s"].as<uint64_t>();
  candidate.start = strcmp(action, "start") == 0;
  result = candidate;
  return true;
}

enum class BuzzerTestStatus { IDLE, RUNNING, COMPLETED, STOPPED, BLOCKED, INTERRUPTED };

class BuzzerTestController {
 public:
  uint32_t commandSeq = 0;
  char lastRequestId[33] = "";
  BuzzerTestStatus status = BuzzerTestStatus::IDLE;
  bool active = false;

  bool accept(const BuzzerTestCommand& command, const char* bootId,
              uint64_t uptimeS, uint32_t now, bool realAlarm) {
    if (strcmp(command.bootId, bootId) != 0 || command.expectedSeq != commandSeq ||
        commandSeq == UINT32_MAX || strcmp(command.requestId, lastRequestId) == 0 ||
        command.expiresUptimeS <= uptimeS || command.expiresUptimeS - uptimeS > 45) return false;
    ++commandSeq;
    strcpy(lastRequestId, command.requestId);
    if (!command.start) {
      active = false;
      status = BuzzerTestStatus::STOPPED;
    } else if (realAlarm) {
      active = false;
      status = BuzzerTestStatus::BLOCKED;
    } else {
      // Another explicit start during the same test does not extend its timer.
      if (!active) startedMs = now;
      active = true;
      status = BuzzerTestStatus::RUNNING;
    }
    return true;
  }

  bool update(uint32_t now, bool realAlarm) {
    if (!active) return false;
    if (realAlarm) {
      active = false;
      status = BuzzerTestStatus::INTERRUPTED;
      return true;
    }
    if (static_cast<uint32_t>(now - startedMs) >= BUZZER_TEST_DURATION_MS) {
      active = false;
      status = BuzzerTestStatus::COMPLETED;
      return true;
    }
    return false;
  }

  uint32_t remainingMs(uint32_t now) const {
    const uint32_t elapsed = now - startedMs;
    return active && elapsed < BUZZER_TEST_DURATION_MS ? BUZZER_TEST_DURATION_MS - elapsed : 0;
  }

  uint32_t telemetryRemainingMs(uint32_t now) const {
    const uint32_t remaining = remainingMs(now);
    // The loop owns actuation. If serialization crosses the deadline between
    // loop updates, keep the reported running/active snapshot consistent;
    // the next update completes the test and forces immediate telemetry.
    return active && remaining == 0 ? 1 : remaining;
  }

  bool outputEnabled(bool realAlarm) const { return realAlarm || active; }

  const char* statusName() const {
    switch (status) {
      case BuzzerTestStatus::RUNNING: return "running";
      case BuzzerTestStatus::COMPLETED: return "completed";
      case BuzzerTestStatus::STOPPED: return "stopped";
      case BuzzerTestStatus::BLOCKED: return "blocked";
      case BuzzerTestStatus::INTERRUPTED: return "interrupted";
      default: return "idle";
    }
  }

 private:
  uint32_t startedMs = 0;
};
