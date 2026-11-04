// Native tests of the exact validators compiled into node_full.ino.
#include <cassert>
#include <iostream>
#include <string>
#include "../firmware/node_full/remote_thresholds.h"
#include "../firmware/node_full/threshold_storage.h"

static const char* REQUEST = "0123456789abcdef0123456789abcdef";
static const char* BOOT = "0123456789abcdef";

std::string command(const std::string& fields = "\"mq2_on\":60,\"mq2_off\":55,\"temperature_on_c\":60.0,\"temperature_off_c\":55.0") {
  return std::string("{\"request_id\":\"") + REQUEST + "\",\"boot_id\":\"" + BOOT +
      "\",\"expected_revision\":0,\"expires_uptime_s\":120,\"thresholds\":{" + fields + "}}";
}

bool parse(const std::string& input, ThresholdCommand& result) {
  return parseThresholdCommand(input.data(), input.size(), result);
}

std::string replace(std::string value, const std::string& before, const std::string& after) {
  const auto pos = value.find(before);
  assert(pos != std::string::npos);
  return value.replace(pos, before.size(), after);
}

int main() {
  unsigned cases = 0;
  ThresholdCommand value = {};
  assert(parse(command(), value)); ++cases;
  assert(value.values.temperatureOnTenths == 600 && value.values.mq2Off == 55); ++cases;
  assert(parse(command("\"mq2_on\":1023,\"mq2_off\":0,\"temperature_on_c\":125,\"temperature_off_c\":-55"), value)); ++cases;
  assert(parse(command("\"mq2_on\":61,\"mq2_off\":55,\"temperature_on_c\":60.1,\"temperature_off_c\":-54.9"), value)); ++cases;
  assert(value.values.temperatureOnTenths == 601 && value.values.temperatureOffTenths == -549); ++cases;
  const std::string invalid[] = {
      command("\"mq2_on\":true,\"mq2_off\":55,\"temperature_on_c\":60,\"temperature_off_c\":55"),
      command("\"mq2_on\":60.0,\"mq2_off\":55,\"temperature_on_c\":60,\"temperature_off_c\":55"),
      command("\"mq2_on\":1024,\"mq2_off\":55,\"temperature_on_c\":60,\"temperature_off_c\":55"),
      command("\"mq2_on\":0,\"mq2_off\":0,\"temperature_on_c\":60,\"temperature_off_c\":55"),
      command("\"mq2_on\":60,\"mq2_off\":60,\"temperature_on_c\":60,\"temperature_off_c\":55"),
      command("\"mq2_on\":60,\"mq2_off\":-1,\"temperature_on_c\":60,\"temperature_off_c\":55"),
      command("\"mq2_on\":60,\"mq2_off\":55,\"temperature_on_c\":55,\"temperature_off_c\":55"),
      command("\"mq2_on\":60,\"mq2_off\":55,\"temperature_on_c\":125.1,\"temperature_off_c\":55"),
      command("\"mq2_on\":60,\"mq2_off\":55,\"temperature_on_c\":60,\"temperature_off_c\":-55.1"),
      command("\"mq2_on\":60,\"mq2_off\":55,\"temperature_on_c\":60.01,\"temperature_off_c\":55"),
      command("\"mq2_on\":60,\"mq2_off\":55,\"temperature_on_c\":true,\"temperature_off_c\":55"),
      command("\"mq2_on\":60,\"mq2_off\":55,\"temperature_on_c\":\"60\",\"temperature_off_c\":55"),
      command("\"mq2_on\":60,\"mq2_off\":55,\"temperature_on_c\":NaN,\"temperature_off_c\":55"),
      command("\"mq2_on\":60,\"mq2_off\":55,\"temperature_on_c\":1e200,\"temperature_off_c\":55"),
      command("\"mq2_on\":60,\"mq2_off\":55,\"temperature_on_c\":60,\"temperature_off_c\":55,\"extra\":1"),
      command("\"mq2_on\":60,\"mq2_off\":55,\"temperature_on_c\":60"),
      command("\"mq2_on\":60,\"mq2_on\":61,\"mq2_off\":55,\"temperature_on_c\":60,\"temperature_off_c\":55"),
      replace(command(), "\"expected_revision\":0", "\"expected_revision\":true"),
      replace(command(), "\"expected_revision\":0", "\"expected_revision\":0.0"),
      replace(command(), "\"expected_revision\":0", "\"expected_revision\":4294967296"),
      replace(command(), "\"expected_revision\":0", "\"expected_revision\":-1"),
      replace(command(), "\"expected_revision\":0", "\"expected_revision\":0,\"extra\":0"),
      replace(command(), "\"expires_uptime_s\":120", "\"expires_uptime_s\":true"),
      replace(command(), "\"expires_uptime_s\":120", "\"expires_uptime_s\":120.0"),
      replace(command(), "\"expires_uptime_s\":120", "\"expires_uptime_s\":18446744073709551616"),
      replace(command(), BOOT, "0123456789abcdeG"),
      replace(command(), REQUEST, "0123456789abcdef0123456789abcde"),
      replace(command(), "\"boot_id\"", "\"boot_\\u0069d\""),
      command() + "{}", command() + "junk", "[" + command() + "]",
      replace(command(), "\"temperature_off_c\":55.0", "\"temperature_off_c\":55.0,"),
      replace(command(), "\"request_id\"", "'request_id'"),
      std::string(513, ' '), command().substr(0, command().size() - 1),
  };
  for (const auto& input : invalid) {
    if (parse(input, value)) { std::cerr << "Unexpected accepted command: " << input << '\n'; return 1; }
    ++cases;
  }
  std::string nul = command(); nul.insert(10, 1, '\0');
  assert(!parse(nul, value)); ++cases;
  assert(parse(" \n" + command() + "\r\n", value)); ++cases;
  ThresholdRecord current = {{50, 45, 600, 550}, 0, ""};
  assert(canApplyThresholdCommand(value, current, BOOT, 100)); ++cases;
  assert(!canApplyThresholdCommand(value, current, "abcdef0123456789", 100)); ++cases;
  assert(!canApplyThresholdCommand(value, current, BOOT, 120)); ++cases;
  assert(!canApplyThresholdCommand(value, current, BOOT, 121)); ++cases;
  assert(!canApplyThresholdCommand(value, current, BOOT, 74)); ++cases;
  assert(canApplyThresholdCommand(value, current, BOOT, 75)); ++cases;
  current.revision = 1;
  assert(!canApplyThresholdCommand(value, current, BOOT, 100)); ++cases;
  current.revision = UINT32_MAX; value.expectedRevision = UINT32_MAX;
  assert(!canApplyThresholdCommand(value, current, BOOT, 100)); ++cases;
  current.revision = 0; value.expectedRevision = 0;
  strcpy(current.lastRequestId, REQUEST);
  assert(!canApplyThresholdCommand(value, current, BOOT, 100)); ++cases;
  current.lastRequestId[0] = '\0'; current.values = value.values;
  assert(!canApplyThresholdCommand(value, current, BOOT, 100)); ++cases;

  ThresholdRecord saved = {{1023, 0, 1250, -550}, 1, ""};
  strcpy(saved.lastRequestId, REQUEST);
  char buffer[513];
  const size_t length = serializeThresholdRecord(saved, buffer, sizeof(buffer));
  assert(length && length < sizeof(buffer)); ++cases;
  ThresholdRecord loaded = {};
  assert(parseThresholdRecord(buffer, length, loaded)); ++cases;
  assert(loaded.revision == 1 && sameThresholdValues(loaded.values, saved.values) &&
      strcmp(loaded.lastRequestId, REQUEST) == 0); ++cases;
  const auto corrupt = replace(std::string(buffer, length), "\"mq2_on\":1023", "\"mq2_on\":1022");
  assert(!parseThresholdRecord(corrupt.data(), corrupt.size(), loaded)); ++cases;
  assert(!parseThresholdRecord(buffer, length - 1, loaded)); ++cases;
  assert(!parseThresholdRecord((std::string(buffer, length) + "{}").data(), length + 2, loaded)); ++cases;
  saved.revision = UINT32_MAX;
  const size_t maxLength = serializeThresholdRecord(saved, buffer, sizeof(buffer));
  assert(parseThresholdRecord(buffer, maxLength, loaded) && loaded.revision == UINT32_MAX); ++cases;
  assert(serializeThresholdRecord(saved, buffer, 8) == 0); ++cases;
  saved.values.mq2Off = 1023;
  assert(serializeThresholdRecord(saved, buffer, sizeof(buffer)) == 0); ++cases;

  // Fault injection executes the actual dual-slot save/recovery class against
  // an in-memory filesystem; no live flash or local MQTT service is accessed.
  fakeStorage = FakeStorageState();
  ThresholdRecord defaults = {{60, 55, 600, 550}, 0, ""};
  ThresholdRecord active = defaults;
  ThresholdStorage storage;
  assert(storage.begin(active) && active.revision == 0); ++cases;
  ThresholdRecord first = {{80, 70, 650, 600}, 1, ""};
  strcpy(first.lastRequestId, REQUEST);
  assert(storage.save(first)); ++cases;
  ThresholdStorage reboot;
  assert(reboot.begin(active) && active.revision == 1 &&
      sameThresholdValues(active.values, first.values)); ++cases;
  ThresholdRecord second = {{90, 80, 700, 650}, 2, "abcdef0123456789abcdef0123456789"};
  assert(reboot.save(second)); ++cases;
  ThresholdStorage reboot2;
  assert(reboot2.begin(active) && active.revision == 2); ++cases;
  const auto committedFiles = fakeStorage.files;
  ThresholdRecord third = {{100, 90, 750, 700}, 3, "123456789abcdef0123456789abcdef0"};
  fakeStorage.failWrite = true;
  assert(!reboot2.save(third)); ++cases;
  fakeStorage.failWrite = false;
  ThresholdStorage afterPartialWrite;
  assert(afterPartialWrite.begin(active) && active.revision == 2); ++cases;
  fakeStorage.failRename = true;
  assert(!afterPartialWrite.save(third)); ++cases;
  fakeStorage.failRename = false;
  ThresholdStorage afterUncommittedTemp;
  assert(afterUncommittedTemp.begin(active) && active.revision == 2); ++cases;
  fakeStorage.corruptRename = true;
  assert(!afterUncommittedTemp.save(third) && !afterUncommittedTemp.ready); ++cases;
  fakeStorage.corruptRename = false;
  ThresholdStorage fallback;
  assert(fallback.begin(active) && active.revision == 2); ++cases;
  fakeStorage.files = committedFiles;
  fakeStorage.files["/threshold1.json"] = "corrupt";
  ThresholdStorage previousRevision;
  assert(previousRevision.begin(active) && active.revision == 1); ++cases;
  fakeStorage.files["/threshold0.json"] = "corrupt";
  ThresholdStorage bothCorrupt;
  assert(!bothCorrupt.begin(active) && !bothCorrupt.ready && fakeStorage.formats == 0); ++cases;
  fakeStorage = FakeStorageState(); fakeStorage.failMount = true; fakeStorage.erased = false;
  ThresholdStorage nonblank;
  assert(!nonblank.begin(active) && fakeStorage.formats == 0); ++cases;
  fakeStorage = FakeStorageState(); fakeStorage.failMount = true;
  ThresholdStorage blank;
  active = defaults;
  assert(blank.begin(active) && active.revision == 0 && fakeStorage.formats == 1); ++cases;
  std::cout << "PASS: " << cases << " firmware threshold parser/replay/record checks\n";
}
