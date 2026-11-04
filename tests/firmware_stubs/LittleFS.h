#pragma once
// Deliberately small fault-injection filesystem used only by native tests.
#include <stdint.h>
#include <stddef.h>
#include <string.h>
#include <map>
#include <string>
#include <vector>

struct FakeStorageState {
  std::map<std::string, std::string> files;
  bool failMount = false, failWrite = false, failRename = false;
  bool corruptRename = false, erased = true;
  unsigned formats = 0;
};
static FakeStorageState fakeStorage;

class File {
 public:
  File() = default;
  explicit File(const char* name) : name_(name), open_(true) {}
  explicit operator bool() const { return open_; }
  size_t size() const { return fakeStorage.files[name_].size(); }
  size_t write(const uint8_t* bytes, size_t length) {
    const size_t written = fakeStorage.failWrite ? length / 2 : length;
    fakeStorage.files[name_].assign(reinterpret_cast<const char*>(bytes), written);
    return written;
  }
  size_t readBytes(char* bytes, size_t length) {
    const std::string& value = fakeStorage.files[name_];
    if (length > value.size()) length = value.size();
    memcpy(bytes, value.data(), length);
    return length;
  }
  void flush() {}
  void close() { open_ = false; }
 private:
  std::string name_;
  bool open_ = false;
};

struct LittleFSConfig { explicit LittleFSConfig(bool) {} };
struct FakeLittleFS {
  void setConfig(const LittleFSConfig&) {}
  bool begin() { return !fakeStorage.failMount; }
  bool format() {
    ++fakeStorage.formats;
    fakeStorage.files.clear();
    fakeStorage.failMount = false;
    return true;
  }
  bool exists(const char* name) { return fakeStorage.files.count(name) != 0; }
  File open(const char* name, const char* mode) {
    if (mode[0] == 'w') { fakeStorage.files[name] = ""; return File(name); }
    return exists(name) ? File(name) : File();
  }
  bool rename(const char* source, const char* destination) {
    if (fakeStorage.failRename || !exists(source)) return false;
    fakeStorage.files[destination] = fakeStorage.files[source];
    fakeStorage.files.erase(source);
    if (fakeStorage.corruptRename) fakeStorage.files[destination][0] = '!';
    return true;
  }
};
static FakeLittleFS LittleFS;
struct FakeESP {
  uint32_t getFlashChipRealSize() const { return 8192; }
  bool flashRead(uint32_t, uint32_t* bytes, size_t length) {
    memset(bytes, fakeStorage.erased ? 0xff : 0x00, length);
    return true;
  }
};
static FakeESP ESP;
struct FakeSerial {
  std::vector<std::string> messages;
  void println(const char* message) { messages.emplace_back(message); }
};
static FakeSerial Serial;
inline void yield() {}
