#include <Arduino.h>
#include <ESP8266WiFi.h>
#include <MQTT.h>
#include <OneWire.h>
#include <DallasTemperature.h>
extern "C" {
#include <user_interface.h>
}
#include "config.h"
#include "alarm_policy.h"
#include "flame_monitor.h"

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
constexpr uint32_t SEND_INTERVAL_MS = 2000, NETWORK_RETRY_MS = 10000;
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
WiFiClient transport;
MQTTClient mqtt(1024);
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
char payload[1024];
IPAddress brokerAddress;
SystemState state = SystemState::FAULT, lastSentState = SystemState::FAULT;

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
  if (enabled) {
    analogWrite(BUZZER_PIN, 128);
  } else {
    analogWrite(BUZZER_PIN, BUZZER_IDLE_LEVEL == HIGH ? 255 : 0);
    digitalWrite(BUZZER_PIN, BUZZER_IDLE_LEVEL);
  }
}

void applyOutputs(uint32_t now) {
  const bool alarm = state == SystemState::ALARM;
  digitalWrite(RED_PIN, alarm ? ((now / 250) % 2 ? LOW : HIGH)
                             : (state == SystemState::FAULT ? HIGH : LOW));
  digitalWrite(GREEN_PIN, alarm ? LOW : HIGH); // red + green = yellow on a fault
  setBuzzer(alarm);
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
                                     TEMP_ALARM_ON_C, TEMP_ALARM_OFF_C);
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
                                        MQ2_ADC_ALARM_ON, MQ2_ADC_ALARM_OFF);
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
  applyOutputs(millis());
}

bool makePayload() {
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
  const char* led = state == SystemState::ALARM ? "red_blink"
                   : state == SystemState::NORMAL ? "green" : "yellow";
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
    "\"limits\":{\"temperature_on_c\":%.2f,\"temperature_off_c\":%.2f}}",
    DEVICE_ID, ROOM_ID, bootId, static_cast<unsigned long>(sequenceNumber),
    static_cast<unsigned long long>(uptimeMs / 1000), stateName(), led,
    buzzerCommand ? "true" : "false", temperature, dsHealth,
    tempAlarm ? "true" : "false", gasLevel, MQ2_ADC_ALARM_ON, MQ2_ADC_ALARM_OFF,
    mqHealth, gasAlarm ? "true" : "false", static_cast<unsigned long>(warmupLeft),
    flameDo, flameHealth, flameAlarm ? "true" : "false", static_cast<unsigned>(FLAME_ALARM_LEVEL),
    flamePowerLevel, flameSupplyName(),
    WiFi.status() == WL_CONNECTED ? "true" : "false",
    mqtt.connected() ? "true" : "false", TEMP_ALARM_ON_C, TEMP_ALARM_OFF_C);
  return n > 0 && static_cast<size_t>(n) < sizeof(payload);
}

void serviceNetwork(uint32_t now) {
  if (!networkConfigured) return;
  if (WiFi.status() != WL_CONNECTED) {
    if (now - lastWifiTry >= 15000) {
      lastWifiTry = now;
      WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
    }
    return;
  }
  if (!mqtt.connected()) {
    if (now - lastNetworkTry < NETWORK_RETRY_MS) return;
    lastNetworkTry = now;
    if (!mqtt.connect(DEVICE_ID, MQTT_USERNAME, MQTT_PASSWORD)) {
      Serial.println("MQTT unavailable; local alarm continues.");
      return;
    }
    Serial.println("MQTT connected.");
    lastSend = now - SEND_INTERVAL_MS;
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
  previousMillis = millis();
  mqCandidateSince = previousMillis;
  lastMqSample = previousMillis - MQ_SAMPLE_MS; // Sample A0 on the first loop.
  networkConfigured = strcmp(WIFI_SSID, "CHANGE_ME") != 0
      && strcmp(MQTT_PASSWORD, "CHANGE_ME") != 0
      && brokerAddress.fromString(MQTT_HOST)
      && safeIdentifier(DEVICE_ID) && safeIdentifier(ROOM_ID);
  WiFi.persistent(false);
  WiFi.mode(WIFI_STA);
  if (networkConfigured) {
    WiFi.setAutoReconnect(true);
    WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
    transport.setTimeout(100);
    mqtt.begin(brokerAddress, MQTT_PORT, transport);
    mqtt.setOptions(15, true, 100);
    lastNetworkTry = millis() - NETWORK_RETRY_MS;
  }
  Serial.println("NODE_FULL_V6_FLAME_POWER TEST: DS=D2 MQ_AO_DIVIDER=A0 FLAME_DO=D0 FLAME_3V3_SENSE=D1 BUZZER=D5 RGB_R/G=D6/D7");
  Serial.println("MQ2 ADC raw counts, NOT ppm. D1 senses Flame VCC presence at the tap, not every sensor fault.");
  if (!networkConfigured) Serial.println("Fill config.h for WiFi/MQTT; local sensing still runs.");
  if (!MQ2_ENABLED) Serial.println("MQ2 disabled in config.h -> yellow.");
  if (!FLAME_ENABLED) Serial.println("Flame sensor disabled in config.h -> yellow.");
}

void loop() {
  sampleAndControl();
  serviceNetwork(millis());
  sampleAndControl(); // Refresh outputs after the bounded synchronous MQTT call.
  const uint32_t now = millis();
  const bool due = now - lastSend >= SEND_INTERVAL_MS || state != lastSentState;
  if (mqtt.connected() && due) {
    ++sequenceNumber;
    if (makePayload() && mqtt.publish(TELEMETRY_TOPIC, payload, false, 0)) {
      lastSend = now;
      lastSentState = state;
    } else {
      lastSend = now; // Retry next period, never flood the local loop.
      lastSentState = state;
    }
  }
  if (now - lastSerial >= 2000) {
    lastSerial = now;
    if (makePayload()) Serial.println(payload);
    else Serial.println("ERROR: telemetry buffer too small");
  }
  delay(10);
}
