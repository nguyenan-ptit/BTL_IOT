#pragma once

#include <LittleFS.h>
#include <flash_hal.h>
#include "remote_thresholds.h"

// Two independently checksummed records retain the previous committed revision.
// A temporary file is verified before an atomic LittleFS rename replaces the
// inactive slot. No acknowledgement is emitted before the renamed file verifies.
class ThresholdStorage {
 public:
  bool ready = false;

  bool begin(ThresholdRecord& current) {
    ready = false;
    activeSlot = -1;
    LittleFS.setConfig(LittleFSConfig(false));
    if (!LittleFS.begin()) {
      // First use can initialize an erased partition. Never autoformat a
      // nonblank/unreadable partition, which may contain recoverable settings.
      if (!partitionErased() || !LittleFS.format() || !LittleFS.begin()) {
        Serial.println("Threshold storage unavailable; local defaults remain active.");
        return false;
      }
    }
    const bool exists0 = LittleFS.exists(path(0)), exists1 = LittleFS.exists(path(1));
    ThresholdRecord record0 = {}, record1 = {};
    const bool valid0 = exists0 && read(path(0), record0);
    const bool valid1 = exists1 && read(path(1), record1);
    if ((exists0 && !valid0) || (exists1 && !valid1))
      Serial.println("Invalid saved threshold record detected; checking previous revision.");
    if (!valid0 && !valid1) {
      if (exists0 || exists1) {
        Serial.println("No valid saved thresholds; remote updates disabled until storage is repaired.");
        return false;
      }
      activeSlot = -1;
    } else {
      if (valid0 && valid1 && record0.revision == record1.revision && !same(record0, record1)) {
        Serial.println("Conflicting saved thresholds; remote updates disabled.");
        return false;
      }
      activeSlot = valid1 && (!valid0 || record1.revision > record0.revision) ? 1 : 0;
      current = activeSlot == 1 ? record1 : record0;
    }
    ready = true;
    return true;
  }

  bool save(const ThresholdRecord& next) {
    if (!ready) return false;
    char bytes[THRESHOLD_COMMAND_MAX + 1];
    const size_t length = serializeThresholdRecord(next, bytes, sizeof(bytes));
    if (!length) return false;
    File file = LittleFS.open("/threshold.tmp", "w");
    if (!file) return false;
    const bool written = file.write(reinterpret_cast<const uint8_t*>(bytes), length) == length;
    file.flush();
    file.close();
    ThresholdRecord verified = {};
    if (!written || !read("/threshold.tmp", verified) || !same(next, verified)) return false;
    const int destination = activeSlot == 0 ? 1 : 0;
    if (!LittleFS.rename("/threshold.tmp", path(destination))) return false;
    if (!read(path(destination), verified) || !same(next, verified)) {
      // The file may have committed despite a read error. Require reboot and
      // recovery before another write instead of creating competing revisions.
      ready = false;
      return false;
    }
    activeSlot = destination;
    return true;
  }

 private:
  int activeSlot = -1;

  static const char* path(int slot) { return slot == 0 ? "/threshold0.json" : "/threshold1.json"; }

  static bool same(const ThresholdRecord& a, const ThresholdRecord& b) {
    return a.revision == b.revision && strcmp(a.lastRequestId, b.lastRequestId) == 0 &&
        sameThresholdValues(a.values, b.values);
  }

  static bool read(const char* name, ThresholdRecord& value) {
    File file = LittleFS.open(name, "r");
    if (!file) return false;
    const size_t length = file.size();
    if (!length || length > THRESHOLD_COMMAND_MAX) { file.close(); return false; }
    char bytes[THRESHOLD_COMMAND_MAX + 1];
    const size_t received = file.readBytes(bytes, length);
    file.close();
    return received == length && parseThresholdRecord(bytes, length, value);
  }

  static bool partitionErased() {
    const uint32_t start = FS_PHYS_ADDR, length = FS_PHYS_SIZE;
    if (!length || start >= ESP.getFlashChipRealSize() ||
        length > ESP.getFlashChipRealSize() - start) return false;
    uint32_t words[64];
    for (uint32_t offset = 0; offset < length; offset += sizeof(words)) {
      const uint32_t count = (length - offset < sizeof(words)) ? length - offset : sizeof(words);
      if (count % 4 || !ESP.flashRead(start + offset, words, count)) return false;
      for (size_t i = 0; i < count / 4; ++i) if (words[i] != UINT32_MAX) return false;
      yield();
    }
    return true;
  }
};
