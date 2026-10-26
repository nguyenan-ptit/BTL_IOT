#include <OneWire.h>
#include <DallasTemperature.h>

// NodeMCU: D2 = GPIO4. Connect DS18B20 DATA here.
// VDD -> 3V3; GND -> GND; 4.7k ohm between DATA and 3V3.
// Verify the probe's wire functions from its product information.
constexpr uint8_t DATA_PIN = 4;

OneWire oneWire(DATA_PIN);
DallasTemperature sensors(&oneWire);

void setup() {
  Serial.begin(115200);
  delay(1000);
  sensors.begin();
  sensors.setWaitForConversion(true);

  Serial.println();
  Serial.println("THU DS18B20 - DATA tai D2 (GPIO4)");
  Serial.print("So cam bien tim thay: ");
  Serial.println(sensors.getDeviceCount());
}

void loop() {
  sensors.requestTemperatures();
  const float tempC = sensors.getTempCByIndex(0);

  if (tempC == DEVICE_DISCONNECTED_C) {
    Serial.println("LOI: Khong doc duoc DS18B20 (-127). Rut USB truoc khi kiem tra day.");
  } else {
    Serial.print("Nhiet do: ");
    Serial.print(tempC, 2);
    Serial.println(" C");
  }

  delay(1000);
}
