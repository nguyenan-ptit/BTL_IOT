#pragma once

#include <ESP8266HTTPClient.h>
#include <LittleFS.h>
#include <MQTT.h>
#include <WiFiClientSecureBearSSL.h>
#include <Updater.h>
#include <algorithm>
#include <time.h>
#include "mqtt_connection_policy.h"
#include "ota_protocol.h"
#include "remote_thresholds.h"

// The MQTT callback only queues input. Network I/O, flash and reboot belong to loop().
class OtaUpdate {
 public:
  const char* startTopic() const { return commandTopic; }
  bool ready() const { return enabled && subscribed; }
  bool pausesMqtt() const { return mqttPaused; }

  void begin(const char* deviceId, const char* version, const char* bootId,
             bool storageReady, bool mqttUsesTls) {
    runningVersion = version;
    currentBoot = bootId;
    device = deviceId;
    secureMqtt = mqttUsesTls;
    snprintf(commandTopic, sizeof(commandTopic), "iot/devices/%s/ota/start", device);
    snprintf(statusTopic, sizeof(statusTopic), "iot/devices/%s/ota/status", device);
    enabled = storageReady && mqttCloudHostnameValid(OTA_DOWNLOAD_HOST) &&
        anchors.append(OTA_DOWNLOAD_CA_PEM) && anchors.getCount() &&
        publicKey.parse(OTA_SIGNING_PUBLIC_KEY_PEM) && publicKey.isRSA() &&
        publicKey.getRSA()->nlen == 256;
    if (!enabled) {
      Serial.println("OTA unavailable: check flash storage, HTTPS CA, host and RSA-2048 public key.");
      return;
    }
    https.setTrustAnchors(&anchors);
    https.setSSLVersion(BR_TLS12, BR_TLS12);
    https.setBufferSizes(16384, 512);
    Update.installSignature(&imageHash, &verifier);

    if (loadReceipt()) {
      if (strcmp(runningVersion, receipt.targetVersion) == 0 &&
          strcmp(currentBoot, receipt.startBoot) != 0)
        setStatus("booted", 100);
      else
        setStatus("failed", 0, "version_mismatch");
    }
  }

  void onConnect(MQTTClient& mqtt) {
    subscribed = enabled && !subscriptionRejected && mqtt.subscribe(commandTopic, 1);
    if (enabled && !subscribed && mqtt.lastError() == LWMQTT_FAILED_SUBSCRIPTION) {
      // This MQTT library closes the connection on a rejected SUBACK. On the
      // next connection restore telemetry/controls without repeating that kick.
      subscriptionRejected = true;
      Serial.println("OTA disabled until reboot: broker rejected OTA subscription.");
    }
    if (status) reportPending = true;
    retryReport = false;
  }

  void enqueue(const char* bytes, size_t length) {
    if (!ready() || !bytes || !length || length > MAX_COMMAND || inboxLength ||
        memchr(bytes, 0, length)) return;
    memcpy(inbox, bytes, length);
    inbox[length] = 0;
    inboxLength = length;
  }

  void service(MQTTClient& mqtt, uint64_t uptime, bool alarm, bool busy) {
    if (inboxLength) {
      const size_t length = inboxLength;
      inboxLength = 0;
      if (stage == Stage::IDLE) acceptCommand(length, uptime, alarm, busy);
    }
    if (stage != Stage::IDLE) {
      if (alarm) fail("alarm_active");
      else if (busy) fail("device_busy");
      else if (WiFi.status() != WL_CONNECTED ||
               (!mqtt.connected() && !mqttPaused))
        fail("connection_lost");
      else if (millis() - startedAt >= MAX_JOB_MS) fail("download_timeout");
    }
    if (!mqttPaused && reportPending && (stage == Stage::OPENING || stage == Stage::INSTALLING)) {
      report(mqtt);
      return; // Check the sensors again after the synchronous MQTT publish.
    }
    report(mqtt);
    switch (stage) {
      case Stage::OPENING: openDownload(mqtt); break;
      case Stage::DOWNLOADING: readChunk(); break;
      case Stage::INSTALLING: finish(); break;
      case Stage::IDLE: break;
    }
  }

 private:
  static constexpr size_t MAX_COMMAND = 1100;
  static constexpr size_t MAX_URL = 768;
  static constexpr uint32_t MAX_JOB_MS = 180000;
  static constexpr uint32_t READ_IDLE_MS = 8000;
  static constexpr const char* RECEIPT_FILE = "/ota_receipt.json";
  static constexpr const char* TEMP_FILE = "/ota_receipt.tmp";
  enum class Stage { IDLE, OPENING, DOWNLOADING, INSTALLING };

  struct Receipt {
    char jobId[49] = {};
    char targetVersion[65] = {};
    char startBoot[17] = {};
  };

  BearSSL::X509List anchors;
  BearSSL::PublicKey publicKey;
  BearSSL::HashSHA256 imageHash;
  BearSSL::SigningVerifier verifier{&publicKey};
  BearSSL::WiFiClientSecure https;
  HTTPClient http;
  BearSSL::HashSHA256 downloadHash;
  const char* device = nullptr;
  const char* runningVersion = nullptr;
  const char* currentBoot = nullptr;
  bool enabled = false;
  bool subscribed = false;
  bool subscriptionRejected = false;
  bool secureMqtt = false, mqttPaused = false;
  char commandTopic[96] = {}, statusTopic[96] = {};
  char inbox[MAX_COMMAND + 1] = {};
  size_t inboxLength = 0;
  char url[MAX_URL + 1] = {}, expectedSha[65] = {};
  uint8_t chunk[1024];
  size_t finalChunk = 0;
  uint32_t size = 0, received = 0, startedAt = 0, lastReadAt = 0;
  Stage stage = Stage::IDLE;
  Receipt receipt;
  const char* status = nullptr;
  const char* error = nullptr;
  uint8_t progress = 0;
  bool reportPending = false, retryReport = false;
  uint32_t lastReport = 0;

  static const char* stringValue(JsonVariantConst input) {
    if (!input.is<const char*>()) return nullptr;
    const JsonString value = input.as<JsonString>();
    return value.c_str() && value.size() == strlen(value.c_str()) ? value.c_str() : nullptr;
  }

  bool validUrl(const char* value) const {
    if (!value || strlen(value) > MAX_URL || strncmp(value, "https://", 8) != 0) return false;
    const size_t hostLength = strlen(OTA_DOWNLOAD_HOST);
    if (strncmp(value + 8, OTA_DOWNLOAD_HOST, hostLength) != 0 || value[8 + hostLength] != '/')
      return false;
    for (const char* p = value + 8 + hostLength; *p; ++p) {
      if (*p <= ' ' || *p > '~' || *p == '#' || *p == '\\') return false;
    }
    return true;
  }

  static bool parseReceipt(JsonObjectConst object, Receipt& parsed) {
    const char* id = stringValue(object["job_id"]);
    const char* target = stringValue(object["target_version"]);
    const char* boot = stringValue(object["boot_id"]);
    if (!otaIdValid(id, 48) || !otaVersionValid(target) || !thresholdHex(boot, 16)) return false;
    strcpy(parsed.jobId, id);
    strcpy(parsed.targetVersion, target);
    strcpy(parsed.startBoot, boot);
    return true;
  }

  void acceptCommand(size_t length, uint64_t uptime, bool alarm, bool busy) {
    StaticJsonDocument<512> json;
    if (deserializeJson(json, inbox, length, DeserializationOption::NestingLimit(1))) return;
    const JsonObjectConst object = json.as<JsonObjectConst>();
    Receipt command;
    const char* download = stringValue(object["url"]);
    const char* sha = stringValue(object["sha256"]);
    if (object.size() != 7 || !parseReceipt(object, command) ||
        !object["size_bytes"].is<uint32_t>() || !object["expires_uptime_s"].is<uint64_t>() ||
        !download || !thresholdHex(sha, 64)) return;
    if (strcmp(command.jobId, receipt.jobId) == 0) {
      if (strcmp(command.targetVersion, receipt.targetVersion) == 0 &&
          strcmp(command.startBoot, receipt.startBoot) == 0) reportPending = true;
      return;
    }
    const uint64_t expires = object["expires_uptime_s"].as<uint64_t>();
    if (strcmp(command.startBoot, currentBoot) != 0 || expires <= uptime ||
        expires - uptime > 120) return;

    receipt = command;
    size = object["size_bytes"].as<uint32_t>();
    if (alarm) return setStatus("failed", 0, "alarm_active");
    if (busy) return setStatus("failed", 0, "device_busy");
    if (strcmp(runningVersion, receipt.targetVersion) == 0)
      return setStatus("failed", 0, "already_on_version");
    if (!validUrl(download)) return setStatus("failed", 0, "invalid_url");
    if (size <= 260 || size > ESP.getFreeSketchSpace())
      return setStatus("failed", 0, "insufficient_flash");
    if (!mqttTlsClockReady(static_cast<int64_t>(time(nullptr))))
      return setStatus("failed", 0, "clock_not_ready");
    strcpy(url, download);
    strcpy(expectedSha, sha);
    received = 0;
    startedAt = millis();
    stage = Stage::OPENING;
    setStatus("downloading", 0);
  }

  void openDownload(MQTTClient& mqtt) {
    if (secureMqtt) {
      // Two BearSSL sessions can exhaust RAM on ESP8266. The initial download
      // status is already acknowledged. Reconnect only on failure or after
      // reboot, not while the Updater still holds its flash write buffer.
      mqttPaused = true;
      mqtt.disconnect();
    }
    Serial.printf("OTA HTTPS begin: %lu bytes, free_heap=%lu\n",
                  static_cast<unsigned long>(size), static_cast<unsigned long>(ESP.getFreeHeap()));
    https.setTimeout(3000);
    http.setTimeout(3000);
    http.useHTTP10(true);
    http.setFollowRedirects(HTTPC_DISABLE_FOLLOW_REDIRECTS);
    if (!http.begin(https, url)) return fail("download_failed");
    const char* headers[] = {"Transfer-Encoding", "Content-Encoding"};
    http.collectHeaders(headers, 2);
    const int response = http.GET();
    url[0] = 0;
    Serial.printf("OTA HTTPS result=%d, TLS error=%d\n", response, response < 0 ? https.getLastSSLError() : 0);
    if (response != HTTP_CODE_OK || http.hasHeader("Transfer-Encoding") ||
        (http.hasHeader("Content-Encoding") && http.header("Content-Encoding") != "identity"))
      return fail("download_failed");
    if (http.getSize() <= 0 || static_cast<uint32_t>(http.getSize()) != size)
      return fail("size_mismatch");
    if (!Update.begin(size, U_FLASH)) return fail("flash_error");
    downloadHash.begin();
    lastReadAt = millis();
    stage = Stage::DOWNLOADING;
  }

  void readChunk() {
    WiFiClient* stream = http.getStreamPtr();
    if (!stream) return fail("download_interrupted");
    const int available = stream->available();
    if (available <= 0) {
      if (millis() - lastReadAt >= READ_IDLE_MS) fail("download_timeout");
      return;
    }
    const size_t count = std::min(std::min(static_cast<size_t>(available), sizeof(chunk)),
                                  static_cast<size_t>(size - received));
    const int read = stream->read(chunk, count);
    if (read <= 0) return fail("download_interrupted");
    const size_t bytes = static_cast<size_t>(read);
    if (received == 0 && chunk[0] != 0xe9) return fail("invalid_image");
    lastReadAt = millis();
    received += bytes;
    downloadHash.add(chunk, bytes);
    if (received == size) {
      closeDownload();
      downloadHash.end();
      const auto* digest = static_cast<const uint8_t*>(downloadHash.hash());
      static constexpr char HEX_DIGITS[] = "0123456789abcdef";
      for (size_t i = 0; i < 32; ++i) {
        if (HEX_DIGITS[digest[i] >> 4] != expectedSha[2 * i] ||
            HEX_DIGITS[digest[i] & 15] != expectedSha[2 * i + 1]) return fail("checksum_mismatch");
      }
      // Keep the last bytes out of Updater until the next loop has checked
      // sensors again. end(false) can discard the incomplete image safely.
      finalChunk = bytes;
      stage = Stage::INSTALLING;
      setStatus("installing", 100);
      Serial.println("OTA download verified; verifying flash image before reboot.");
      return;
    }
    if (Update.write(chunk, bytes) != bytes) return fail("flash_error");
    const uint8_t bucket = static_cast<uint8_t>((received * 10ULL / size) * 10);
    if (bucket != progress) setStatus("downloading", bucket);
  }

  void finish() {
    if (!saveReceipt()) return fail("storage_error");
    if (Update.write(chunk, finalChunk) != finalChunk) return fail("flash_error");
    if (!Update.end(false))
      return fail(Update.getError() == UPDATE_ERROR_SIGN ? "invalid_signature" : "flash_error");
    Serial.println("OTA image staged. Restarting.");
    ESP.restart();
    stage = Stage::IDLE;
  }

  void closeDownload() {
    // HTTPClient may already see EOF and drop its copy without calling stop().
    // Stop the original BearSSL client as well to release its shared buffers.
    https.stop(250);
    http.end();
  }

  void fail(const char* reason) {
    closeDownload();
    if (Update.isRunning()) Update.end(false); // The last chunk has not been written or write failed.
    mqttPaused = false;
    url[0] = 0;
    stage = Stage::IDLE;
    Serial.printf("OTA failed: %s\n", reason);
    setStatus("failed", progress, reason);
  }

  bool saveReceipt() {
    StaticJsonDocument<384> json;
    json["job_id"] = receipt.jobId;
    json["target_version"] = receipt.targetVersion;
    json["boot_id"] = receipt.startBoot;
    File file = LittleFS.open(TEMP_FILE, "w");
    if (!file) return false;
    const bool written = serializeJson(json, file) == measureJson(json);
    file.close();
    Receipt verified;
    return written && readReceipt(TEMP_FILE, verified) &&
        strcmp(receipt.jobId, verified.jobId) == 0 &&
        strcmp(receipt.targetVersion, verified.targetVersion) == 0 &&
        strcmp(receipt.startBoot, verified.startBoot) == 0 &&
        LittleFS.rename(TEMP_FILE, RECEIPT_FILE);
  }

  static bool readReceipt(const char* path, Receipt& value) {
    File file = LittleFS.open(path, "r");
    if (!file || !file.size() || file.size() > 256) return false;
    StaticJsonDocument<384> json;
    return !deserializeJson(json, file, DeserializationOption::NestingLimit(1)) &&
        json.size() == 3 && parseReceipt(json.as<JsonObjectConst>(), value);
  }

  bool loadReceipt() { return readReceipt(RECEIPT_FILE, receipt); }

  void setStatus(const char* next, uint8_t percent, const char* reason = nullptr) {
    status = next;
    progress = percent;
    error = reason;
    reportPending = true;
  }

  void report(MQTTClient& mqtt) {
    if (!reportPending || !ready() || !mqtt.connected() ||
        (retryReport && millis() - lastReport < 1000)) return;
    StaticJsonDocument<384> json;
    json["device_id"] = device;
    json["job_id"] = receipt.jobId;
    json["boot_id"] = currentBoot;
    json["target_version"] = receipt.targetVersion;
    json["firmware_version"] = runningVersion;
    json["status"] = status;
    json["progress"] = progress;
    json["error"] = error;
    char body[448];
    const size_t length = serializeJson(json, body, sizeof(body));
    lastReport = millis();
    retryReport = !mqtt.publish(statusTopic, body, static_cast<int>(length), false, 1);
    reportPending = retryReport;
  }
};
