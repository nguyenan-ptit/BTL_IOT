#include <Arduino.h>
#include <ESP8266WiFi.h>
#include <ESP8266WebServer.h>
#include <DNSServer.h>
#include <EEPROM.h>
#include <MQTT.h>
#include <OneWire.h>
#include <DallasTemperature.h>
extern "C" {
#include <user_interface.h>
}
#include "config.h"
#include "alarm_policy.h"
#include "flame_monitor.h"
#include "device_control.h"
#include "mqtt_connection_policy.h"

#ifndef MQTT_USE_TLS
#define MQTT_USE_TLS 0
#endif
#if MQTT_USE_TLS != 0 && MQTT_USE_TLS != 1
#error "MQTT_USE_TLS must be 0 or 1"
#endif
#if MQTT_USE_TLS
#include <WiFiClientSecureBearSSL.h>
#include <time.h>
#if __has_include("mqtt_ca.h")
#include "mqtt_ca.h"
#define MQTT_HAS_CA 1
#else
#define MQTT_HAS_CA 0
#endif
#endif

// COMMON-CATHODE RGB: common -> GND. One 330-ohm resistor per colour.
// R -> D6; G -> D7; B DISCONNECTED. Green/red/yellow use R/G only.
// Flame DO -> suitable 3.3V interface -> D0. Flame AO unused; D0 is INPUT.
// Remove RGB B from D0 BEFORE using it as a Flame input.
// MQ-2 AO -> 47k -> A0; A0 -> 10k -> common GND. MQ DO disconnected.
// A0 belongs ONLY to MQ-2. REMOVE the V4 Flame VCC sensing branch from A0.
// V6: Flame module-side 3V3 VCC -> 4.7k -> D1; D1 -> 47k -> common GND.
// D1 measures supply presence at this point only. Do NOT use this branch with 5V.
// Never connect AO/5V directly to A0. ADC values/thresholds are NOT ppm.
// DS18B20 DATA -> D2, VDD -> 3V3, GND -> GND; DATA -> 4.7k -> 3V3.
// MQ-2 heater requires its appropriate 5V supply, never the ESP 3V3 rail.
// Buzzer I/O -> D5; VCC -> 3V3; GND shared. Disconnect power to change wires.
// Software cannot repair USB overcurrent. Do not power a known faulty circuit.

constexpr uint8_t DS_PIN = D2, BUZZER_PIN = D5;
constexpr uint8_t RED_PIN = D6, GREEN_PIN = D7, FLAME_PIN = D0;
constexpr uint8_t FLAME_SUPPLY_PIN = D1;
constexpr uint32_t DS_INTERVAL_MS = 1000, DS_CONVERSION_MS = 800;
constexpr uint32_t DS_STALE_MS = 5000, MQ_STABLE_MS = 300;
constexpr uint32_t DEFAULT_SEND_INTERVAL_MS = 2000, NETWORK_RETRY_MS = 10000;
constexpr uint32_t MQ_SAMPLE_MS = 20;
static_assert(TEMP_ALARM_ON_C > TEMP_ALARM_OFF_C, "Invalid temperature hysteresis");
static_assert(TEMP_ALARM_OFF_C >= -55.0f && TEMP_ALARM_ON_C <= 125.0f, "Threshold outside DS18B20 range");
static_assert(MQ2_WARMUP_MS <= 86400000UL, "Warmup exceeds protocol limit of one day");
static_assert(MQ2_ADC_ALARM_OFF >= 0 && MQ2_ADC_ALARM_OFF < MQ2_ADC_ALARM_ON
              && MQ2_ADC_ALARM_ON <= 1023, "Invalid MQ2 ADC hysteresis");
static_assert(BUZZER_IDLE_LEVEL == LOW || BUZZER_IDLE_LEVEL == HIGH, "Invalid buzzer idle");
static_assert(FLAME_ALARM_LEVEL == LOW || FLAME_ALARM_LEVEL == HIGH, "Invalid flame polarity");
static_assert(FLAME_STABLE_MS >= 20 && FLAME_STABLE_MS <= 5000, "Invalid flame filter duration");
static_assert(FLAME_SUPPLY_STABLE_MS >= 20 && FLAME_SUPPLY_STABLE_MS <= 5000,
              "Invalid Flame supply filter duration");

OneWire oneWire(DS_PIN);
DallasTemperature thermometer(&oneWire);
#if MQTT_USE_TLS
BearSSL::WiFiClientSecure transport;
BearSSL::X509List mqttTrustAnchors;
bool mqttClockStarted = false;
#else
WiFiClient transport;
#endif
MQTTClient mqtt(1536, 128);
DeviceControl deviceControl({MQ2_ADC_ALARM_ON, MQ2_ADC_ALARM_OFF,
    static_cast<int>(lroundf(TEMP_ALARM_ON_C * 10.0f)),
    static_cast<int>(lroundf(TEMP_ALARM_OFF_C * 10.0f))});
DeviceAddress dsAddress;
FlameMonitor flameMonitor;
bool dsFound = false, dsConverting = false, dsValid = false;
bool tempAlarm = false, gasAlarm = false, flameAlarm = false, buzzerCommand = false;
bool mqSampled = false, mqCandidateAlarm = false, networkConfigured = false;
float temperatureC = 0;
const char* dsHealth = "pending";
const char* mqHealth = "warming_up";
const char* flameHealth = "power_checking";
int mqAdc = 0;
int flameLevel = HIGH, flamePowerLevel = LOW;
uint32_t dsStarted = 0, dsNextTry = 0, dsLastValid = 0;
uint32_t mqCandidateSince = 0, lastSend = 0, lastSerial = 0;
uint32_t lastMqSample = 0;
uint32_t lastNetworkTry = 0, lastWifiTry = 0, previousMillis = 0;
uint64_t uptimeMs = 0;
uint32_t sequenceNumber = 0;
char bootId[17];
char payload[1536];
char telemetryTopic[96], configSetTopic[96], outputTestTopic[96];
constexpr char FIRMWARE_VERSION[] = "node-full-v7-backend-compatible";
IPAddress brokerAddress;
SystemState state = SystemState::FAULT, lastSentState = SystemState::FAULT;

// Wi-Fi provisioning is local to this ESP; MQTT identities/topics are unchanged.
// Hold FLASH/D3 for 3 seconds AFTER boot, or send "wifi" in Serial Monitor.
// The protected setup AP also opens after 30 seconds without a working Wi-Fi.
constexpr uint8_t WIFI_SETUP_BUTTON_PIN = D3;
constexpr uint32_t WIFI_SETTINGS_MAGIC = 0x57494631UL;
constexpr uint32_t WIFI_PORTAL_WINDOW_MS = 300000, WIFI_OFFLINE_SETUP_MS = 30000;
constexpr uint32_t WIFI_CONNECT_TIMEOUT_MS = 20000, WIFI_PORTAL_COOLDOWN_MS = 60000;
struct WifiSettings {
  uint32_t magic;
  char ssid[33];
  char password[65];
  char setupPassword[17];
  uint32_t checksum;
};
WifiSettings wifiSettings = {};
ESP8266WebServer wifiPortal(IPAddress(192, 168, 4, 1), 80);
DNSServer wifiDns;
bool wifiStoreReady = false, wifiPortalActive = false, wifiWasConnected = false;
bool wifiCandidateActive = false, wifiRequestQueued = false, wifiButtonHandled = false;
uint32_t wifiOfflineSince = 0, wifiPortalStartedAt = 0, wifiPortalEndedAt = 0;
uint32_t wifiCandidateStartedAt = 0, wifiConnectedAt = 0, wifiButtonStartedAt = 0;
char wifiCandidateSsid[33] = {}, wifiCandidatePassword[65] = {};
char wifiSetupSsid[33] = {}, wifiPortalToken[33] = {}, wifiSerialLine[12] = {};
uint8_t wifiSerialLength = 0;
const char* wifiPortalStatus = "Nhập tên Wi-Fi 2,4 GHz và mật khẩu, sau đó bấm Kết nối và lưu.";

const char WIFI_SETUP_PAGE[] PROGMEM = R"HTML(<!doctype html>
<html lang="vi"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Cấu hình Wi-Fi IoT</title><style>body{font:18px sans-serif;max-width:440px;margin:30px auto;padding:18px;background:#f5f7fa}input,button{box-sizing:border-box;width:100%;padding:12px;margin:8px 0;font:inherit}button{background:#06376a;color:white;border:0}p{line-height:1.5}</style>
<h2>Cấu hình Wi-Fi cho ESP8266</h2><p>Nhập thông tin mạng Wi-Fi <b>2,4 GHz</b>. Trang cài đặt này không cần Internet.</p>
<form id="f"><input type="hidden" name="token" value="%TOKEN%">
<label>Tên Wi-Fi (SSID)<input name="ssid" maxlength="32" required autocomplete="off"></label>
<label>Mật khẩu Wi-Fi<input name="password" type="password" maxlength="64" autocomplete="new-password"></label>
<p>Để trống nếu mạng Wi-Fi không có mật khẩu.</p><button id="save">Kết nối và lưu</button></form>
<p id="status" role="status"></p><p>Sau khi kết nối thành công, chuyển điện thoại hoặc máy tính về Wi-Fi có Internet. Mạng cài đặt sẽ tự tắt.</p>
<script>const s=document.querySelector('#status'),b=document.querySelector('#save');let busy=false;
document.querySelector('#f').onsubmit=async e=>{e.preventDefault();if(busy)return;busy=true;b.disabled=true;try{const r=await fetch('/save',{method:'POST',body:new URLSearchParams(new FormData(e.target))});const j=await r.json();s.textContent=j.message;if(!r.ok){busy=false;b.disabled=false}}catch(e){s.textContent='Mất kết nối với ESP. Kết nối lại mạng cài đặt và mở http://192.168.4.1.';busy=false;b.disabled=false}};
setInterval(async()=>{try{const r=await fetch('/status',{cache:'no-store'});if(!r.ok)return;const j=await r.json();s.textContent=j.message;if(!j.busy){busy=false;b.disabled=false}}catch(e){}},2000);</script></html>)HTML";

uint32_t wifiSettingsChecksum() {
  const uint8_t* bytes = reinterpret_cast<const uint8_t*>(&wifiSettings);
  uint32_t result = 2166136261UL;
  for (size_t i = 0; i < offsetof(WifiSettings, checksum); ++i)
    result = (result ^ bytes[i]) * 16777619UL;
  return result;
}

bool saveWifiSettings() {
  if (!wifiStoreReady) return false;
  wifiSettings.magic = WIFI_SETTINGS_MAGIC;
  wifiSettings.checksum = wifiSettingsChecksum();
  EEPROM.put(0, wifiSettings);
  return EEPROM.commit(); // Only a successful setup/key creation writes flash.
}

void loadWifiSettings() {
  EEPROM.begin(512);
  wifiStoreReady = EEPROM.length() >= sizeof(wifiSettings);
  if (wifiStoreReady) EEPROM.get(0, wifiSettings);
  if (wifiStoreReady && wifiSettings.magic == WIFI_SETTINGS_MAGIC
      && wifiSettings.ssid[32] == 0 && wifiSettings.password[64] == 0
      && wifiSettings.setupPassword[16] == 0
      && strlen(wifiSettings.setupPassword) == 16
      && wifiSettings.checksum == wifiSettingsChecksum()) return;
  memset(&wifiSettings, 0, sizeof(wifiSettings));
  snprintf(wifiSettings.setupPassword, sizeof(wifiSettings.setupPassword), "%08lx%08lx",
           static_cast<unsigned long>(os_random()), static_cast<unsigned long>(os_random()));
  if (!saveWifiSettings()) Serial.println("Wi-Fi storage unavailable; setup password may change after reboot.");
}

bool beginKnownWifi() {
  // A verified saved network takes priority. config.h is only an initial fallback.
  const char* ssid = wifiSettings.ssid[0] ? wifiSettings.ssid : WIFI_SSID;
  const char* password = wifiSettings.ssid[0] ? wifiSettings.password : WIFI_PASSWORD;
  if (!ssid[0] || strlen(ssid) > 32 || strlen(password) > 64
      || strcmp(ssid, "CHANGE_ME") == 0 || strcmp(ssid, "YOUR_WIFI_2G") == 0
      || (!wifiSettings.ssid[0] && strcmp(password, "CHANGE_ME") == 0)) return false;
  WiFi.begin(ssid, password); // Asynchronous: never wait here for WL_CONNECTED.
  lastWifiTry = millis();
  return true;
}

bool wifiPortalClientAllowed() {
  // Never expose provisioning through the router/Internet-facing STA interface.
  if (wifiPortalActive && wifiPortal.client().localIP() == WiFi.softAPIP()) {
    wifiPortal.sendHeader("Cache-Control", "no-store");
    wifiPortal.sendHeader("X-Content-Type-Options", "nosniff");
    wifiPortal.sendHeader("X-Frame-Options", "DENY");
    return true;
  }
  wifiPortal.send(403, "text/plain; charset=utf-8", "Vui lòng kết nối trực tiếp với Wi-Fi cài đặt của ESP.");
  return false;
}

void configureWifiPortalRoutes() {
  wifiPortal.on("/", HTTP_GET, []() {
    if (!wifiPortalClientAllowed()) return;
    String page(FPSTR(WIFI_SETUP_PAGE));
    page.replace("%TOKEN%", wifiPortalToken);
    wifiPortal.send(200, "text/html; charset=utf-8", page);
  });
  wifiPortal.on("/status", HTTP_GET, []() {
    if (!wifiPortalClientAllowed()) return;
    StaticJsonDocument<256> document;
    document["message"] = wifiPortalStatus;
    document["busy"] = wifiRequestQueued || wifiCandidateActive;
    String response;
    serializeJson(document, response);
    wifiPortal.send(200, "application/json", response);
  });
  wifiPortal.on("/save", HTTP_POST, []() {
    if (!wifiPortalClientAllowed()) return;
    if (!wifiPortal.hasArg("token") || wifiPortal.arg("token") != wifiPortalToken) {
      wifiPortal.send(403, "application/json", "{\"message\":\"Trang đã hết hạn. Mở lại http://192.168.4.1.\"}");
      return;
    }
    if (!wifiStoreReady) {
      wifiPortal.send(503, "application/json", "{\"message\":\"Không thể lưu Wi-Fi vào bộ nhớ.\"}");
      return;
    }
    if (wifiRequestQueued || wifiCandidateActive) {
      wifiPortal.send(409, "application/json", "{\"message\":\"Đang thử kết nối. Vui lòng chờ.\"}");
      return;
    }
    const String ssid = wifiPortal.arg("ssid"), password = wifiPortal.arg("password");
    bool passwordValid = password.length() == 0 || (password.length() >= 8 && password.length() <= 63);
    if (password.length() == 64) {
      passwordValid = true;
      for (size_t i = 0; i < password.length(); ++i)
        if (!isxdigit(static_cast<unsigned char>(password[i]))) passwordValid = false;
    }
    if (ssid.length() == 0 || ssid.length() > 32 || !passwordValid
        || strlen(ssid.c_str()) != ssid.length() || strlen(password.c_str()) != password.length()) {
      wifiPortal.send(422, "application/json", "{\"message\":\"Tên Wi-Fi tối đa 32 byte; mật khẩu dài 8-63 byte, 64 ký tự hex hoặc để trống.\"}");
      return;
    }
    ssid.toCharArray(wifiCandidateSsid, sizeof(wifiCandidateSsid));
    password.toCharArray(wifiCandidatePassword, sizeof(wifiCandidatePassword));
    wifiRequestQueued = true; // Connect outside the HTTP callback, after responding.
    wifiConnectedAt = 0;
    wifiPortalStartedAt = millis();
    wifiPortalStatus = "Đang thử kết nối. Chỉ lưu khi nhận được địa chỉ IP.";
    wifiPortal.send(202, "application/json", "{\"message\":\"Đã nhận thông tin. Đang thử kết nối Wi-Fi...\"}");
  });
  wifiPortal.onNotFound([]() {
    if (!wifiPortalClientAllowed()) return;
    wifiPortal.sendHeader("Location", "http://192.168.4.1/", true);
    wifiPortal.send(302, "text/plain; charset=utf-8", "Mở http://192.168.4.1/ để cài đặt Wi-Fi.");
  });
}

void startWifiPortal() {
  if (wifiPortalActive) return;
  WiFi.mode(WIFI_AP_STA);
  const IPAddress setupIp(192, 168, 4, 1);
  if (!WiFi.softAPConfig(setupIp, setupIp, IPAddress(255, 255, 255, 0))
      || !WiFi.softAP(wifiSetupSsid, wifiSettings.setupPassword, 1, false, 1)) {
    WiFi.softAPdisconnect(true);
    WiFi.mode(WIFI_STA);
    wifiPortalEndedAt = millis();
    Serial.println("Cannot start Wi-Fi setup AP; retry with FLASH or Serial wifi.");
    return;
  }
  snprintf(wifiPortalToken, sizeof(wifiPortalToken), "%08lx%08lx%08lx%08lx",
           static_cast<unsigned long>(os_random()), static_cast<unsigned long>(os_random()),
           static_cast<unsigned long>(os_random()), static_cast<unsigned long>(os_random()));
  wifiPortalStatus = "Nhập tên Wi-Fi 2,4 GHz và mật khẩu, sau đó bấm Kết nối và lưu.";
  wifiPortalStartedAt = millis();
  wifiConnectedAt = 0;
  wifiPortalActive = true;
  wifiDns.start(53, "*", setupIp);
  wifiPortal.begin();
  // Unique local setup key, not the router or MQTT password. Record it privately.
  Serial.printf("Wi-Fi setup AP: %s\nSetup AP password: %s\nOpen http://192.168.4.1/ (5 minute window).\n",
                wifiSetupSsid, wifiSettings.setupPassword);
}

void stopWifiPortal() {
  wifiPortal.stop();
  wifiDns.stop();
  WiFi.softAPdisconnect(true);
  WiFi.mode(WIFI_STA);
  wifiPortalActive = false;
  wifiPortalEndedAt = millis();
  wifiPortalToken[0] = 0;
  Serial.println("Wi-Fi setup AP closed.");
}

void beginWifiProvisioning() {
  pinMode(WIFI_SETUP_BUTTON_PIN, INPUT_PULLUP);
  loadWifiSettings();
  snprintf(wifiSetupSsid, sizeof(wifiSetupSsid), "IOT-Setup-%.14s-%06lx", DEVICE_ID,
           static_cast<unsigned long>(ESP.getChipId() & 0xffffff));
  configureWifiPortalRoutes();
  WiFi.persistent(false); // EEPROM is the only source of saved provisioning data.
  WiFi.mode(WIFI_STA);
  WiFi.setAutoReconnect(true);
  wifiOfflineSince = millis();
  wifiPortalEndedAt = millis() - WIFI_PORTAL_COOLDOWN_MS;
  if (!beginKnownWifi()) startWifiPortal();
  Serial.println("Hold FLASH/D3 for 3s after boot, or send wifi + Enter to configure Wi-Fi.");
}

void serviceWifiProvisioning(uint32_t now) {
  if (digitalRead(WIFI_SETUP_BUTTON_PIN) == LOW) {
    if (!wifiButtonStartedAt) wifiButtonStartedAt = now;
    if (!wifiButtonHandled && now - wifiButtonStartedAt >= 3000) {
      wifiButtonHandled = true;
      startWifiPortal();
    }
  } else {
    wifiButtonStartedAt = 0;
    wifiButtonHandled = false;
  }
  // Bounded Serial input; no readStringUntil()/connection-wait loops.
  for (uint8_t n = 0; n < 16 && Serial.available(); ++n) {
    const char ch = static_cast<char>(Serial.read());
    if (ch == '\r' || ch == '\n') {
      wifiSerialLine[wifiSerialLength] = 0;
      if (strcmp(wifiSerialLine, "wifi") == 0) startWifiPortal();
      wifiSerialLength = 0;
    } else if (wifiSerialLength < sizeof(wifiSerialLine) - 1) {
      wifiSerialLine[wifiSerialLength++] = ch;
    } else wifiSerialLength = 0;
  }
  if (wifiPortalActive) {
    wifiDns.processNextRequest();
    wifiPortal.handleClient();
  }
  if (wifiRequestQueued) {
    wifiRequestQueued = false;
    wifiCandidateActive = true;
    if (mqtt.connected()) mqtt.disconnect();
    WiFi.disconnect(false);
    WiFi.begin(wifiCandidateSsid, wifiCandidatePassword);
    wifiCandidateStartedAt = lastWifiTry = millis();
  }
  now = millis(); // HTTP/Wi-Fi calls can advance time; avoid unsigned underflow.
  const bool connected = WiFi.status() == WL_CONNECTED;
  if (connected) {
    if (!wifiWasConnected) {
      Serial.print("Wi-Fi connected. IP: ");
      Serial.println(WiFi.localIP());
    }
    if (wifiCandidateActive && WiFi.SSID() == wifiCandidateSsid) {
      const WifiSettings previous = wifiSettings;
      strcpy(wifiSettings.ssid, wifiCandidateSsid);
      strcpy(wifiSettings.password, wifiCandidatePassword);
      if (saveWifiSettings()) {
        wifiPortalStatus = "Đã kết nối và lưu Wi-Fi. Mạng cài đặt sẽ tắt sau 15 giây.";
        wifiConnectedAt = millis();
        Serial.println("New Wi-Fi verified and saved; MQTT identity unchanged.");
      } else {
        wifiSettings = previous;
        if (wifiStoreReady) EEPROM.put(0, wifiSettings);
        wifiPortalStatus = "Đã kết nối nhưng lưu bộ nhớ thất bại. Vui lòng thử lại.";
      }
      wifiCandidateActive = false;
      memset(wifiCandidatePassword, 0, sizeof(wifiCandidatePassword));
    }
  } else {
    if (wifiWasConnected) wifiOfflineSince = now;
    if (!wifiCandidateActive && now - lastWifiTry >= 15000) beginKnownWifi();
    if (!wifiPortalActive && now - wifiOfflineSince >= WIFI_OFFLINE_SETUP_MS
        && now - wifiPortalEndedAt >= WIFI_PORTAL_COOLDOWN_MS) startWifiPortal();
  }
  if (wifiCandidateActive && now - wifiCandidateStartedAt >= WIFI_CONNECT_TIMEOUT_MS) {
    wifiCandidateActive = false;
    memset(wifiCandidatePassword, 0, sizeof(wifiCandidatePassword));
    wifiPortalStatus = "Kết nối thất bại. Kiểm tra Wi-Fi 2,4 GHz và mật khẩu. Cấu hình cũ vẫn được giữ.";
    beginKnownWifi();
  }
  wifiWasConnected = connected;
  now = millis(); // A flash commit must not make the new close deadline look old.
  if (wifiPortalActive && (now - wifiPortalStartedAt >= WIFI_PORTAL_WINDOW_MS
      || (wifiConnectedAt && now - wifiConnectedAt >= 15000))) stopWifiPortal();
}

// Never apply commands or publish from a callback; the loop owns flash/output.
void deviceMessageReceived(MQTTClient*, char topic[], char bytes[], int length) {
  if (length <= 0) return;
  if (strcmp(topic, configSetTopic) == 0)
    deviceControl.enqueue(DeviceCommandKind::THRESHOLDS, bytes, static_cast<size_t>(length));
  else if (strcmp(topic, outputTestTopic) == 0)
    deviceControl.enqueue(DeviceCommandKind::OUTPUT_TEST, bytes, static_cast<size_t>(length));
}

void serviceDeviceCommand(uint32_t now) {
  if (!deviceControl.service(bootId, uptimeMs / 1000, now, state == SystemState::ALARM)) return;
  // Retain confirmed alarms until fresh readings evaluate the new limits.
  // Mark the old temperature unavailable so telemetry cannot contradict its
  // new limits while waiting for the next DS conversion.
  if (dsValid) {
    dsValid = false;
    dsHealth = "pending";
  }
  mqCandidateAlarm = gasAlarm;
  mqCandidateSince = millis();
  mqHealth = !MQ2_ENABLED ? "disabled" : uptimeMs < MQ2_WARMUP_MS ? "warming_up" : "filtering";
}

bool reached(uint32_t now, uint32_t deadline) {
  return static_cast<int32_t>(now - deadline) >= 0;
}

bool safeIdentifier(const char* value) {
  const size_t length = strlen(value);
  if (length == 0 || length > 32) return false;
  for (size_t i = 0; i < length; ++i) {
    const char c = value[i];
    if (!((c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') ||
          (c >= '0' && c <= '9') || c == '_' || c == '-')) return false;
  }
  return true;
}

const char* stateName() {
  if (state == SystemState::ALARM) return "alarm";
  return state == SystemState::NORMAL ? "normal" : "fault";
}

void setBuzzer(bool enabled) {
  if (enabled == buzzerCommand) return;
  buzzerCommand = enabled;

  digitalWrite(BUZZER_PIN,
               enabled ? LOW : BUZZER_IDLE_LEVEL);
}

void applyOutputs(uint32_t now) {
  const DeviceOutputSelection output = selectDeviceOutputs(state, deviceControl.outputTest.active, now);
  digitalWrite(RED_PIN, output.redHigh ? HIGH : LOW);
  digitalWrite(GREEN_PIN, output.greenHigh ? HIGH : LOW);
  setBuzzer(output.buzzerOn);
}

void dsFailure(const char* reason) {
  dsHealth = reason;
  dsValid = false;
  dsConverting = false;
  dsFound = false;
  // tempAlarm is intentionally retained until a valid safe reading arrives.
}

bool findDs18b20() {
  uint8_t address[8];
  oneWire.reset_search();
  while (oneWire.search(address)) {
    if (address[0] == 0x28 && OneWire::crc8(address, 7) == address[7]) {
      memcpy(dsAddress, address, 8);
      thermometer.setResolution(dsAddress, 12);
      return true;
    }
    yield();
  }
  return false;
}

void serviceTemperature(uint32_t now) {
  if (dsValid && now - dsLastValid > DS_STALE_MS) dsFailure("stale");
  if (dsConverting) {
    if (now - dsStarted < DS_CONVERSION_MS) return;
    dsConverting = false;
    dsNextTry = now + DS_INTERVAL_MS;
    if (!thermometer.isConversionComplete()) {
      dsFailure("conversion_timeout");
      return;
    }
    const float value = thermometer.getTempC(dsAddress);
    if (!isfinite(value) || value < -55.0f || value > 125.0f) {
      if (value == DEVICE_POWER_ON_RESET_C) dsFailure("power_reset");
      else if (value == DEVICE_INSUFFICIENT_POWER_C) dsFailure("insufficient_power");
      else dsFailure("read_error");
      return;
    }
    temperatureC = value;
    dsLastValid = now;
    dsValid = true;
    dsHealth = "ok";
    tempAlarm = nextTemperatureAlarm(tempAlarm, true, value,
                                     (deviceControl.thresholds.values.temperatureOnTenths / 10.0f), (deviceControl.thresholds.values.temperatureOffTenths / 10.0f));
    return;
  }
  if (!reached(now, dsNextTry)) return;
  dsNextTry = now + DS_INTERVAL_MS;
  if (!dsFound) {
    dsFound = findDs18b20();
    if (!dsFound) {
      dsFailure("missing");
      return;
    }
  }
  if (!thermometer.requestTemperaturesByAddress(dsAddress)) {
    dsFailure("read_error");
    return;
  }
  dsStarted = millis();
  dsConverting = true;
}

void serviceGas(uint32_t now) {
  if (!MQ2_ENABLED) {
    mqHealth = "disabled";
    return;
  }
  if (now - lastMqSample < MQ_SAMPLE_MS) return;
  lastMqSample = now;
  mqAdc = analogRead(A0);
  const bool desired = nextAnalogAlarm(gasAlarm, mqAdc,
                                        deviceControl.thresholds.values.mq2On, deviceControl.thresholds.values.mq2Off);
  if (!mqSampled || desired != mqCandidateAlarm) {
    mqCandidateAlarm = desired;
    mqCandidateSince = now;
  }
  mqSampled = true;
  if (uptimeMs < MQ2_WARMUP_MS) {
    mqHealth = "warming_up";
  } else if (now - mqCandidateSince < MQ_STABLE_MS) {
    mqHealth = "filtering";
  } else {
    mqHealth = "ok";
    gasAlarm = mqCandidateAlarm;
  }
  // Raw ADC alone cannot diagnose every disconnected wire or heater/power fault.
  // In particular, zero ADC is not proof of a healthy or a failed MQ-2.
}

const char* flameSupplyName() {
  if (flameMonitor.supply == FlameSupplyState::PRESENT) return "present";
  return flameMonitor.supply == FlameSupplyState::MISSING ? "missing" : "checking";
}

void serviceFlame(uint32_t now) {
  flamePowerLevel = digitalRead(FLAME_SUPPLY_PIN);
  flameLevel = digitalRead(FLAME_PIN);
  flameMonitor.update(now, flamePowerLevel == HIGH,
                      flameLevel == FLAME_ALARM_LEVEL, FLAME_ENABLED,
                      FLAME_SUPPLY_STABLE_MS, FLAME_STABLE_MS);
  flameAlarm = flameMonitor.alarm;
  switch (flameMonitor.status) {
    case FlameReadState::DISABLED: flameHealth = "disabled"; break;
    case FlameReadState::POWER_CHECKING: flameHealth = "power_checking"; break;
    case FlameReadState::POWER_MISSING: flameHealth = "power_missing"; break;
    case FlameReadState::FILTERING: flameHealth = "filtering"; break;
    case FlameReadState::OK: flameHealth = "ok"; break;
  }
  // No fresh DO alarm is accepted during supply checking/loss.
  // A previously confirmed alarm is held until valid safe DO returns.
}

void sampleAndControl() {
  const uint32_t now = millis();
  uptimeMs += static_cast<uint32_t>(now - previousMillis);
  previousMillis = now;
  serviceTemperature(now);
  serviceGas(now);
  serviceFlame(now);
  state = chooseState(tempAlarm, gasAlarm, flameAlarm, dsValid,
                      strcmp(mqHealth, "ok") == 0, strcmp(flameHealth, "ok") == 0);
  deviceControl.update(millis(), state == SystemState::ALARM);
  applyOutputs(millis());
}

bool makePayload() {
  char controls[384];
  if (!deviceControl.serializeTelemetry(controls, sizeof(controls), millis())) return false;
  // Merge the control object's members; its final '}' closes the telemetry root.
  char temperature[24], gasLevel[8], flameDo[8];
  if (dsValid) snprintf(temperature, sizeof(temperature), "%.2f", temperatureC);
  else strcpy(temperature, "null");
  if (MQ2_ENABLED && mqSampled) snprintf(gasLevel, sizeof(gasLevel), "%d", mqAdc);
  else strcpy(gasLevel, "null");
  if (flameMonitor.doValid())
    snprintf(flameDo, sizeof(flameDo), "%d", flameLevel);
  else strcpy(flameDo, "null");
  const uint32_t warmupLeft = MQ2_ENABLED && uptimeMs < MQ2_WARMUP_MS
      ? static_cast<uint32_t>((MQ2_WARMUP_MS - uptimeMs + 999) / 1000) : 0;
  const char* led = selectDeviceOutputs(state, deviceControl.outputTest.active, millis()).ledName;
  const int n = snprintf(payload, sizeof(payload),
    "{\"schema_version\":6,\"test\":true,\"device_id\":\"%s\",\"room\":\"%s\","
    "\"boot_id\":\"%s\",\"seq\":%lu,\"uptime_s\":%llu,\"system_state\":\"%s\","
    "\"led\":\"%s\",\"buzzer_cmd\":%s,"
    "\"temperature\":{\"value_c\":%s,\"health\":\"%s\",\"alarm\":%s},"
    "\"mq2\":{\"mode\":\"analog\",\"do_level\":null,\"adc_raw\":%s,"
    "\"adc_on\":%d,\"adc_off\":%d,\"health\":\"%s\",\"alarm\":%s,"
    "\"diagnostics\":\"limited_analog\",\"warmup_remaining_s\":%lu},"
    "\"flame\":{\"do_level\":%s,\"health\":\"%s\",\"alarm\":%s,"
    "\"alarm_level\":%u,\"diagnostics\":\"limited_do\",\"power_adc\":null,"
    "\"power_mode\":\"digital_d1\",\"power_level\":%d,\"power_health\":\"%s\","
    "\"power_adc_min\":null,\"power_adc_zero\":null},"
    "\"network\":{\"wifi\":%s,\"mqtt\":%s},"
    "\"limits\":{\"temperature_on_c\":%.2f,\"temperature_off_c\":%.2f},%s",
    DEVICE_ID, ROOM_ID, bootId, static_cast<unsigned long>(sequenceNumber),
    static_cast<unsigned long long>(uptimeMs / 1000), stateName(), led,
    buzzerCommand ? "true" : "false", temperature, dsHealth,
    tempAlarm ? "true" : "false", gasLevel, deviceControl.thresholds.values.mq2On, deviceControl.thresholds.values.mq2Off,
    mqHealth, gasAlarm ? "true" : "false", static_cast<unsigned long>(warmupLeft),
    flameDo, flameHealth, flameAlarm ? "true" : "false", static_cast<unsigned>(FLAME_ALARM_LEVEL),
    flamePowerLevel, flameSupplyName(),
    WiFi.status() == WL_CONNECTED ? "true" : "false",
    mqtt.connected() ? "true" : "false", (deviceControl.thresholds.values.temperatureOnTenths / 10.0f), (deviceControl.thresholds.values.temperatureOffTenths / 10.0f), controls + 1);
  return n > 0 && static_cast<size_t>(n) < sizeof(payload);
}

void configureMqtt() {
  networkConfigured = strcmp(MQTT_PASSWORD, "CHANGE_ME") != 0
      && safeIdentifier(DEVICE_ID) && safeIdentifier(ROOM_ID) && MQTT_PORT != 0;
#if MQTT_USE_TLS
  networkConfigured = networkConfigured && mqttCloudHostnameValid(MQTT_HOST);
#if MQTT_HAS_CA
  if (networkConfigured) networkConfigured = mqttTrustAnchors.append(MQTT_TLS_CA_CERT)
      && mqttTrustAnchors.getCount() > 0;
#else
  networkConfigured = false;
#endif
  if (networkConfigured) {
    transport.setTrustAnchors(&mqttTrustAnchors);
    transport.setSSLVersion(BR_TLS12, BR_TLS12);
    transport.setTimeout(1000);
    // Keep the DNS hostname for SNI and X.509 hostname verification.
    mqtt.begin(MQTT_HOST, MQTT_PORT, transport);
  }
#else
  networkConfigured = networkConfigured && brokerAddress.fromString(MQTT_HOST);
  if (networkConfigured) {
    transport.setTimeout(100);
    mqtt.begin(brokerAddress, MQTT_PORT, transport);
  }
#endif
  if (networkConfigured) {
    mqtt.onMessageAdvanced(deviceMessageReceived);
    mqtt.setOptions(15, true, MQTT_USE_TLS ? 2000 : 100);
    lastNetworkTry = millis() - NETWORK_RETRY_MS;
  }
}

void serviceNetwork(uint32_t now) {
  if (!networkConfigured || WiFi.status() != WL_CONNECTED || wifiCandidateActive) return;
#if MQTT_USE_TLS
  if (!mqttClockStarted) {
    configTime(0, 0, "pool.ntp.org", "time.google.com");
    mqttClockStarted = true;
  }
  if (!mqttTlsClockReady(static_cast<int64_t>(time(nullptr)))) return;
#endif
  if (!mqtt.connected()) {
    // An offline output test must still end locally after three seconds.
    if (deviceControl.outputTest.active || now - lastNetworkTry < NETWORK_RETRY_MS) return;
    lastNetworkTry = now;
    mqtt.setTimeout(MQTT_USE_TLS ? 2000 : 100);
    if (!mqtt.connect(DEVICE_ID, MQTT_USERNAME, MQTT_PASSWORD)) {
      Serial.println("MQTT unavailable; reconnect will be retried.");
      return;
    }
    if (!mqtt.subscribe(configSetTopic, 1) || !mqtt.subscribe(outputTestTopic, 1)) {
      Serial.println("Control subscription rejected; check broker ACL.");
      mqtt.disconnect();
      return;
    }
    mqtt.setTimeout(MQTT_USE_TLS ? 1000 : 100);
    Serial.println("MQTT connected; threshold and output-test subscriptions ready.");
    deviceControl.telemetryDirty = true;
    lastSend = millis() - DEFAULT_SEND_INTERVAL_MS;
  }
  mqtt.loop();
}

void setup() {
  Serial.begin(115200);
  digitalWrite(BUZZER_PIN, BUZZER_IDLE_LEVEL);
  pinMode(BUZZER_PIN, OUTPUT);
  analogWriteRange(255);
  analogWriteFreq(2000);
  // Force the initial OFF command even though the state variable starts false.
  buzzerCommand = true;
  setBuzzer(false);
  for (uint8_t pin : {RED_PIN, GREEN_PIN}) {
    digitalWrite(pin, LOW);
    pinMode(pin, OUTPUT);
  }
  pinMode(FLAME_PIN, INPUT); // GPIO16 supports polled INPUT, no INPUT_PULLUP/interrupt.
  pinMode(FLAME_SUPPLY_PIN, INPUT); // Needs the external 47k pull-down; no INPUT_PULLUP.
  applyOutputs(millis());
  thermometer.begin();
  thermometer.setAutoSaveScratchPad(false);
  thermometer.setWaitForConversion(false);
  thermometer.setCheckForConversion(false);
  snprintf(bootId, sizeof(bootId), "%08lx%08lx",
           static_cast<unsigned long>(os_random()), static_cast<unsigned long>(os_random()));
  snprintf(configSetTopic, sizeof(configSetTopic), "iot/devices/%s/config/set", DEVICE_ID);
  snprintf(telemetryTopic, sizeof(telemetryTopic), "iot/devices/%s/telemetry", DEVICE_ID);
  snprintf(outputTestTopic, sizeof(outputTestTopic), "iot/devices/%s/buzzer/test", DEVICE_ID);
  deviceControl.begin();
  previousMillis = millis();
  mqCandidateSince = previousMillis;
  lastMqSample = previousMillis - MQ_SAMPLE_MS; // Sample A0 on the first loop.
  configureMqtt();
  beginWifiProvisioning();
  Serial.println("NODE_FULL_V7_BACKEND_COMPATIBLE TEST: DS=D2 MQ_AO_DIVIDER=A0 FLAME_DO=D0 FLAME_3V3_SENSE=D1 BUZZER=D5 RGB_R/G=D6/D7");
  Serial.println("MQ2 ADC raw counts, NOT ppm. D1 senses Flame VCC presence at the tap, not every sensor fault.");
  Serial.println(FIRMWARE_VERSION);
  Serial.println("Thresholds use verified LittleFS records; ACKs are included in telemetry.");
  if (!networkConfigured) Serial.println("Check MQTT host/credentials/CA and IDs in config.h; local Wi-Fi setup and sensing still run.");
  if (!MQ2_ENABLED) Serial.println("MQ2 disabled in config.h -> yellow.");
  if (!FLAME_ENABLED) Serial.println("Flame sensor disabled in config.h -> yellow.");
}

void loop() {
  sampleAndControl();
  serviceWifiProvisioning(millis());
  sampleAndControl(); // Wi-Fi setup does not wait in a loop for the router.
  serviceNetwork(millis());
  sampleAndControl(); // DNS/TCP/TLS calls are synchronous; refresh outputs afterwards.
  serviceDeviceCommand(millis());
  sampleAndControl();
  const uint32_t now = millis();
  const bool due = now - lastSend >= DEFAULT_SEND_INTERVAL_MS || state != lastSentState || deviceControl.telemetryDirty;
  if (mqtt.connected() && due) {
    ++sequenceNumber;
    if (makePayload() && mqtt.publish(telemetryTopic, payload, false, 0)) {
      lastSend = now;
      lastSentState = state;
      deviceControl.telemetryDirty = false;
    } else {
      lastSend = now; // Retry next period, never flood the local loop.
      lastSentState = state;
      deviceControl.telemetryDirty = false;
    }
  }
  if (now - lastSerial >= 2000) {
    lastSerial = now;
    if (makePayload()) Serial.println(payload);
    else Serial.println("ERROR: telemetry buffer too small");
  }
  delay(10);
}
