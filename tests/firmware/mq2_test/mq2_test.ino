#include <Arduino.h>

// MQ-2 analog wiring, with all power disconnected while changing wires:
// AO -> 47k ohm -> signal junction -> ESP A0.
// Signal junction -> 10k ohm -> common GND.
// MQ-2 GND -> common GND; leave DO unconnected.
// Use a confirmed suitable 5V supply for MQ-2. Do not assume VIN outputs 5V.
// Do not connect AO directly to ESP A0.
// This sketch only displays raw ADC counts; it is not calibrated in ppm.

void setup() {
  Serial.begin(115200);
  delay(1000);
  Serial.println();
  Serial.println("MQ2 - THU DOC AO QUA CHIA AP 47k / 10k");
  Serial.println("Gia tri ADC 0..1023; chua hieu chuan, khong phai ppm.");
  Serial.println("Gia tri co the troi khi cam bien dang lam nong.");
}

void loop() {
  const int raw = analogRead(A0);
  Serial.print("MQ2_ADC=");
  Serial.println(raw);
  delay(1000);
}
