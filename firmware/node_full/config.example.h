#pragma once

// Public template. Copy this file to config.h locally before compiling.
// Keep config.h, secrets.h and discovery_key.h out of Git.
// node_full.ino includes Arduino.h before this header.

constexpr char WIFI_SSID[] = "CHANGE_ME";
constexpr char WIFI_PASSWORD[] = "CHANGE_ME";
// LAN IPv4 of the broker, used when signed discovery is unavailable.
// 127.0.0.1 refers to the ESP itself and must not be used here.
constexpr char MQTT_HOST[] = "192.168.1.10";
constexpr uint16_t MQTT_PORT = 1884;
constexpr char MQTT_USERNAME[] = "iot_demo";
constexpr char MQTT_PASSWORD[] = "CHANGE_ME";
// Give every ESP its own ID; the room is its actual installation location.
constexpr char DEVICE_ID[] = "node01";
constexpr char ROOM_ID[] = "101";

// MQ-2 AO is read through its divider at A0; DO is not used by this version.
constexpr bool MQ2_ENABLED = true;
constexpr uint8_t MQ2_ALARM_LEVEL = LOW; // Legacy DO setting, unused by V6.
// Startup waiting period, not calibration or proof of heater readiness.
constexpr uint32_t MQ2_WARMUP_MS = 300000UL;

// Defaults only: valid thresholds already saved in LittleFS take precedence.
// These are prototype test values, not calibrated safety limits.
constexpr float TEMP_ALARM_ON_C = 60.0f;
constexpr float TEMP_ALARM_OFF_C = 55.0f;
constexpr int MQ2_ADC_ALARM_ON = 60;
constexpr int MQ2_ADC_ALARM_OFF = 55;

// Existing firmware drives the buzzer on D5 with 2 kHz, ~50% PWM when enabled.
// Confirm the actual module's trigger polarity and electrical requirements.
constexpr uint8_t BUZZER_IDLE_LEVEL = HIGH;

// Flame DO remains D0; supply presence uses its separate 3V3 divider at D1.
constexpr bool FLAME_ENABLED = true;
constexpr uint8_t FLAME_ALARM_LEVEL = LOW;
constexpr uint32_t FLAME_STABLE_MS = 100;
constexpr uint32_t FLAME_SUPPLY_STABLE_MS = 300;

// Historical V4 A0 supply-monitor constants, retained for source compatibility.
// V6 reserves A0 for MQ-2 AO and does not use these settings.
constexpr int FLAME_POWER_ADC_MIN = 100;
constexpr int FLAME_POWER_ADC_ZERO = 30;
constexpr uint32_t FLAME_POWER_STABLE_MS = 300;
