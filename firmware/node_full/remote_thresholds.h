#pragma once

// The wire/storage validators are independent of Arduino, so native tests run
// the same parser and checksum code as the ESP firmware.
#include <ArduinoJson.h>
#include <stdint.h>
#include <stddef.h>
#include <string.h>
#include <math.h>

constexpr size_t THRESHOLD_COMMAND_MAX = 512;

struct ThresholdValues {
  int mq2On;
  int mq2Off;
  int temperatureOnTenths;
  int temperatureOffTenths;
};

struct ThresholdRecord {
  ThresholdValues values;
  uint32_t revision;
  char lastRequestId[33];
};

struct ThresholdCommand {
  ThresholdValues values;
  uint32_t expectedRevision;
  uint64_t expiresUptimeS;
  char requestId[33];
  char bootId[17];
};

inline bool thresholdHex(const char* value, size_t length) {
  if (!value || strlen(value) != length) return false;
  for (size_t i = 0; i < length; ++i) {
    if (!((value[i] >= '0' && value[i] <= '9') ||
          (value[i] >= 'a' && value[i] <= 'f'))) return false;
  }
  return true;
}

constexpr bool validThresholdValues(const ThresholdValues& value) {
  return value.mq2On >= 1 && value.mq2On <= 1023 &&
      value.mq2Off >= 0 && value.mq2Off < value.mq2On &&
      value.temperatureOffTenths >= -550 && value.temperatureOnTenths <= 1250 &&
      value.temperatureOffTenths < value.temperatureOnTenths;
}

constexpr bool sameThresholdValues(const ThresholdValues& a, const ThresholdValues& b) {
  return a.mq2On == b.mq2On && a.mq2Off == b.mq2Off &&
      a.temperatureOnTenths == b.temperatureOnTenths &&
      a.temperatureOffTenths == b.temperatureOffTenths;
}

// Only plain ASCII keys/IDs are used by this protocol. Reject escaped names,
// duplicate fields, embedded NULs and concatenated/trailing JSON documents.
inline bool thresholdJsonEnvelope(const char* raw, size_t length,
                                  const char* const* requiredKeys, size_t count) {
  if (!raw || length == 0 || length > THRESHOLD_COMMAND_MAX) return false;
  bool string = false, started = false, complete = false;
  int depth = 0;
  for (size_t i = 0; i < length; ++i) {
    const char c = raw[i];
    if (c == '\0' || c == '\\' || c == '\'') return false;
    if (c == '"') {
      if (complete) return false;
      string = !string;
    } else if (!string) {
      const bool whitespace = c == ' ' || c == '\r' || c == '\n' || c == '\t';
      if (complete && !whitespace) return false;
      if (!started && !whitespace) {
        if (c != '{') return false;
        started = true;
      }
      if (c == '{') { if (++depth > 3) return false; }
      if (c == '}') {
        if (--depth < 0) return false;
        if (depth == 0) complete = true;
      }
      if (c == '[' || c == ']') return false;
    } else if (static_cast<unsigned char>(c) < 0x20) {
      return false;
    }
  }
  if (string || !complete || depth != 0) return false;
  for (size_t k = 0; k < count; ++k) {
    const size_t keyLength = strlen(requiredKeys[k]);
    size_t matches = 0;
    for (size_t i = 0; i + keyLength + 2 <= length; ++i) {
      if (raw[i] == '"' && raw[i + keyLength + 1] == '"' &&
          memcmp(raw + i + 1, requiredKeys[k], keyLength) == 0) ++matches;
    }
    if (matches != 1) return false;
  }
  return true;
}

inline bool thresholdTemperature(JsonVariantConst input, int& tenths) {
  if (!input.is<double>() || input.is<bool>()) return false;
  const double value = input.as<double>();
  if (!isfinite(value) || value < -55.0 || value > 125.0) return false;
  const double rounded = round(value * 10.0);
  if (fabs(value * 10.0 - rounded) > 0.00001) return false;
  tenths = static_cast<int>(rounded);
  return true;
}

inline bool parseThresholdCommand(const char* raw, size_t length, ThresholdCommand& result) {
  static const char* const keys[] = {"request_id", "boot_id", "expected_revision",
      "expires_uptime_s", "thresholds", "mq2_on", "mq2_off", "temperature_on_c",
      "temperature_off_c"};
  if (!thresholdJsonEnvelope(raw, length, keys, sizeof(keys) / sizeof(keys[0]))) return false;
  StaticJsonDocument<768> document;
  if (deserializeJson(document, raw, length, DeserializationOption::NestingLimit(3))) return false;
  const JsonObjectConst object = document.as<JsonObjectConst>();
  const JsonObjectConst thresholds = object["thresholds"].as<JsonObjectConst>();
  if (object.size() != 5 || thresholds.size() != 4 ||
      !object["request_id"].is<const char*>() || !object["boot_id"].is<const char*>() ||
      !thresholdHex(object["request_id"], 32) || !thresholdHex(object["boot_id"], 16) ||
      !object["expected_revision"].is<uint32_t>() ||
      !object["expires_uptime_s"].is<uint64_t>() ||
      !thresholds["mq2_on"].is<int>() || !thresholds["mq2_off"].is<int>()) return false;
  ThresholdCommand candidate = {};
  candidate.values.mq2On = thresholds["mq2_on"].as<int>();
  candidate.values.mq2Off = thresholds["mq2_off"].as<int>();
  if (!thresholdTemperature(thresholds["temperature_on_c"], candidate.values.temperatureOnTenths) ||
      !thresholdTemperature(thresholds["temperature_off_c"], candidate.values.temperatureOffTenths) ||
      !validThresholdValues(candidate.values)) return false;
  candidate.expectedRevision = object["expected_revision"].as<uint32_t>();
  candidate.expiresUptimeS = object["expires_uptime_s"].as<uint64_t>();
  strcpy(candidate.requestId, object["request_id"].as<const char*>());
  strcpy(candidate.bootId, object["boot_id"].as<const char*>());
  result = candidate;
  return true;
}

inline bool canApplyThresholdCommand(const ThresholdCommand& command,
                                    const ThresholdRecord& current,
                                    const char* bootId, uint64_t uptimeS) {
  return strcmp(command.bootId, bootId) == 0 &&
      command.expectedRevision == current.revision && current.revision != UINT32_MAX &&
      command.expiresUptimeS > uptimeS && command.expiresUptimeS - uptimeS <= 45 &&
      strcmp(command.requestId, current.lastRequestId) != 0 &&
      !sameThresholdValues(command.values, current.values);
}

inline uint32_t thresholdRecordChecksum(const ThresholdRecord& record) {
  uint32_t checksum = 2166136261UL;
  const uint32_t words[] = {1, record.revision, static_cast<uint32_t>(record.values.mq2On),
      static_cast<uint32_t>(record.values.mq2Off),
      static_cast<uint32_t>(record.values.temperatureOnTenths),
      static_cast<uint32_t>(record.values.temperatureOffTenths)};
  for (size_t word = 0; word < sizeof(words) / sizeof(words[0]); ++word) {
    for (unsigned shift = 0; shift < 32; shift += 8)
      checksum = (checksum ^ static_cast<uint8_t>(words[word] >> shift)) * 16777619UL;
  }
  for (size_t i = 0; i < 32; ++i)
    checksum = (checksum ^ static_cast<uint8_t>(record.lastRequestId[i])) * 16777619UL;
  return checksum;
}

inline size_t serializeThresholdRecord(const ThresholdRecord& record, char* output, size_t size) {
  if (!validThresholdValues(record.values) || !record.revision ||
      !thresholdHex(record.lastRequestId, 32)) return 0;
  StaticJsonDocument<512> document;
  document["version"] = 1;
  document["revision"] = record.revision;
  document["last_request_id"] = record.lastRequestId;
  document["mq2_on"] = record.values.mq2On;
  document["mq2_off"] = record.values.mq2Off;
  document["temperature_on_tenths"] = record.values.temperatureOnTenths;
  document["temperature_off_tenths"] = record.values.temperatureOffTenths;
  document["checksum"] = thresholdRecordChecksum(record);
  if (document.overflowed() || measureJson(document) >= size) return 0;
  return serializeJson(document, output, size);
}

inline bool parseThresholdRecord(const char* raw, size_t length, ThresholdRecord& result) {
  static const char* const keys[] = {"version", "revision", "last_request_id", "mq2_on", "mq2_off",
      "temperature_on_tenths", "temperature_off_tenths", "checksum"};
  if (!thresholdJsonEnvelope(raw, length, keys, sizeof(keys) / sizeof(keys[0]))) return false;
  StaticJsonDocument<640> document;
  if (deserializeJson(document, raw, length, DeserializationOption::NestingLimit(2))) return false;
  const JsonObjectConst object = document.as<JsonObjectConst>();
  if (object.size() != 8 || !object["version"].is<int>() || object["version"].as<int>() != 1 ||
      !object["revision"].is<uint32_t>() || !object["revision"].as<uint32_t>() ||
      !object["last_request_id"].is<const char*>() || !thresholdHex(object["last_request_id"], 32) ||
      !object["mq2_on"].is<int>() || !object["mq2_off"].is<int>() ||
      !object["temperature_on_tenths"].is<int>() ||
      !object["temperature_off_tenths"].is<int>() || !object["checksum"].is<uint32_t>()) return false;
  ThresholdRecord candidate = {};
  candidate.revision = object["revision"].as<uint32_t>();
  strcpy(candidate.lastRequestId, object["last_request_id"].as<const char*>());
  candidate.values = {object["mq2_on"].as<int>(), object["mq2_off"].as<int>(),
      object["temperature_on_tenths"].as<int>(), object["temperature_off_tenths"].as<int>()};
  if (!validThresholdValues(candidate.values) ||
      thresholdRecordChecksum(candidate) != object["checksum"].as<uint32_t>()) return false;
  result = candidate;
  return true;
}

#ifdef ALARM_POLICY_SELF_TEST
static_assert(validThresholdValues({60, 55, 600, 550}), "Defaults valid");
static_assert(validThresholdValues({1, 0, 1250, -550}), "Boundary thresholds valid");
static_assert(!validThresholdValues({60, 60, 600, 550}), "ADC hysteresis required");
static_assert(!validThresholdValues({60, 55, 550, 550}), "Temperature hysteresis required");
static_assert(!validThresholdValues({1024, 55, 600, 550}), "ADC bound enforced");
static_assert(!validThresholdValues({60, 55, 1251, 550}), "Temperature bound enforced");
#endif
