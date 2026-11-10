#pragma once

// Public template. Copy this file to config.h locally before compiling.
// Keep config.h, secrets.h and discovery_key.h out of Git.
// node_full.ino includes Arduino.h before this header.

// 0: existing LAN IPv4/TCP mode; 1: cloud hostname/TLS 1.2 mode.
// TLS mode requires the provider CA in mqtt_ca.h and successful NTP time sync.
// Copy mqtt_ca.example.h to mqtt_ca.h and paste the CA downloaded from the provider.
// Signed LAN discovery is disabled in TLS mode; there is no plaintext fallback.
#define MQTT_USE_TLS 0

// Initial fallback only. FLASH/D3 (hold 3s after boot) opens the setup AP;
// verified Wi-Fi saved there overrides these values across reboots.
constexpr char WIFI_SSID[] = "CHANGE_ME";
constexpr char WIFI_PASSWORD[] = "CHANGE_ME";
// LAN mode: IPv4 broker fallback. TLS mode: exact provider DNS hostname,
// such as your-cluster.example.com, with no mqtts:// prefix, path or :port.
// 127.0.0.1 refers to the ESP itself and must not be used here.
constexpr char MQTT_HOST[] = "192.168.1.10";
// Use the provider's TLS port (usually 8883) when MQTT_USE_TLS is 1.
constexpr uint16_t MQTT_PORT = 1884;
constexpr char MQTT_USERNAME[] = "iot_demo";
constexpr char MQTT_PASSWORD[] = "CHANGE_ME";
// Give every ESP its own ID; the room is its actual installation location.
constexpr char DEVICE_ID[] = "node01";
constexpr char ROOM_ID[] = "101";

// MQ-2 AO -> 47k -> A0 junction; junction -> 10k -> common GND.
// A0 belongs ONLY to MQ-2; DO is disconnected. Never connect AO/5V directly to A0.
// These thresholds are raw ADC counts, not ppm.
// Set false only to intentionally disable this sensor.
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

// Flame DO -> suitable 3.3V interface -> D0/GPIO16, polled as INPUT.
// Disconnect the RGB B wire from D0 BEFORE connecting the flame signal.
// V6 monitors the 3V3 supply AT the Flame module independently from DO:
// module-side VCC -> 4.7k -> D1 junction; junction -> 47k -> common GND.
// Only for a confirmed 3V3 source. Never put 5V/VV directly on D1.
constexpr bool FLAME_ENABLED = true;
constexpr uint8_t FLAME_ALARM_LEVEL = LOW; // Verify polarity on the actual module.
constexpr uint32_t FLAME_STABLE_MS = 100;
constexpr uint32_t FLAME_SUPPLY_STABLE_MS = 300;

// Historical V4 A0 supply-monitor constants, retained for source compatibility.
// V6 reserves A0 for MQ-2 AO and does not use these settings.
constexpr int FLAME_POWER_ADC_MIN = 100;
constexpr int FLAME_POWER_ADC_ZERO = 30;
constexpr uint32_t FLAME_POWER_STABLE_MS = 300;
