#pragma once

// Copy config.example.h to config.h locally, then fill in real values. Never commit config.h.
constexpr char WIFI_SSID[] = "YOUR_WIFI_2G";
constexpr char WIFI_PASSWORD[] = "CHANGE_ME";
// IPv4 address of the PC running Mosquitto; recheck after changing networks.
constexpr char MQTT_HOST[] = "192.0.2.10";
constexpr uint16_t MQTT_PORT = 1884;
constexpr char MQTT_USERNAME[] = "CHANGE_ME";
constexpr char MQTT_PASSWORD[] = "CHANGE_ME";
constexpr char DEVICE_ID[] = "node01";
constexpr char ROOM_ID[] = "101";
constexpr char TELEMETRY_TOPIC[] = "iot/test";

// V5: MQ-2 AO -> 47k -> A0 junction; junction -> 10k -> common GND.
// A0 belongs ONLY to MQ-2. MQ DO is disconnected; D1 monitors Flame VCC in V6.
// Never connect AO/5V directly to A0. These thresholds are raw counts, NOT ppm.
// Set false only to intentionally disable this sensor; the web will say disabled.
constexpr bool MQ2_ENABLED = true;
constexpr int MQ2_ADC_ALARM_ON = 60;
constexpr int MQ2_ADC_ALARM_OFF = 55;
// Startup waiting period, NOT calibration or proof of sensor readiness.
constexpr uint32_t MQ2_WARMUP_MS = 300000UL;

// Flame module DO -> suitable 3.3V interface -> D0/GPIO16, polled as INPUT.
// Disconnect the RGB B wire from D0 BEFORE connecting the flame signal.
constexpr bool FLAME_ENABLED = true;
constexpr uint8_t FLAME_ALARM_LEVEL = LOW; // Assumption: verify on the actual module.
constexpr uint32_t FLAME_STABLE_MS = 100;
// V6: monitor the 3V3 supply AT the Flame module, independently from DO.
// Module-side VCC -> 4.7k -> D1 junction; junction -> 47k -> common GND.
// Only for a confirmed 3V3 source. Never put 5V/VV directly on D1.
constexpr uint32_t FLAME_SUPPLY_STABLE_MS = 300;

// Prototype thresholds only; not certified fire-alarm settings.
constexpr float TEMP_ALARM_ON_C = 60.0f;
constexpr float TEMP_ALARM_OFF_C = 55.0f;
// HIGH is the current hypothesis for this user's LOW-trigger buzzer module.
// Confirm actual sound/off behaviour with the real module.
constexpr uint8_t BUZZER_IDLE_LEVEL = HIGH;
