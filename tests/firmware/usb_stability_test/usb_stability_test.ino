#include <Arduino.h>
#include <ESP8266WiFi.h>

// USB diagnostic only. Test with the ESP disconnected from all sensors.
// This sketch does not read MQ-2 or change the voltage limits of any pin.
// Open Serial Monitor at 115200 baud.

unsigned long lastPrintMs = 0;
unsigned long lineCount = 0;

void setup() {
  Serial.begin(115200);
  WiFi.persistent(false);
  WiFi.mode(WIFI_OFF);
  delay(500);

  Serial.println();
  Serial.println("=== ESP8266 USB TEST: KHOI DONG ===");
  Serial.print("Ly do khoi dong: ");
  Serial.println(ESP.getResetReason());
}

void loop() {
  const unsigned long now = millis();
  if (now - lastPrintMs >= 1000UL) {
    lastPrintMs = now;
    ++lineCount;
    Serial.print("ESP OK | Dong: ");
    Serial.print(lineCount);
    Serial.print(" | Da chay: ");
    Serial.print(now / 1000UL);
    Serial.println(" giay");
  }
  yield();
}
