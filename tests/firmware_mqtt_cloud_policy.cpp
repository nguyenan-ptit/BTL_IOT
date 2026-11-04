#include <cassert>
#include <iostream>
#include <string>

#include "../firmware/node_full/mqtt_connection_policy.h"

int main() {
  unsigned cases = 0;
  for (const char* host : {"cluster.example.com", "A1-b2.emqxsl.com", "mqtt.example.co.uk"}) {
    assert(mqttCloudHostnameValid(host));
    ++cases;
  }
  for (const char* host : {"", "a", "localhost", "192.168.1.10", "127.0.0.1",
                          "mqtts://cluster.example.com", "cluster.example.com:8883",
                          "cluster.example.com/path", "cluster.example.com ",
                          ".example.com", "example.com.", "example..com",
                          "-cluster.example.com", "cluster-.example.com",
                          "cluster.example.-com", "cluster.example.com-",
                          "cluster_example.com", "cluster.example.com\n"}) {
    assert(!mqttCloudHostnameValid(host));
    ++cases;
  }
  assert(!mqttCloudHostnameValid(nullptr)); ++cases;
  const std::string longestLabel(63, 'a');
  assert(mqttCloudHostnameValid((longestLabel + ".example.com").c_str())); ++cases;
  assert(!mqttCloudHostnameValid((std::string(64, 'a') + ".example.com").c_str())); ++cases;
  const std::string longestHost = longestLabel + "." + longestLabel + "." +
      longestLabel + "." + std::string(61, 'b');
  assert(longestHost.size() == 253 && mqttCloudHostnameValid(longestHost.c_str())); ++cases;
  assert(!mqttCloudHostnameValid((longestHost + "c").c_str())); ++cases;

  assert(!mqttTlsClockReady(-1)); ++cases;
  assert(!mqttTlsClockReady(0)); ++cases;
  assert(!mqttTlsClockReady(INT64_C(1704067199))); ++cases;
  assert(mqttTlsClockReady(INT64_C(1704067200))); ++cases;
  assert(mqttTlsClockReady(INT64_C(1793779200))); ++cases;
  std::cout << "PASS: " << cases << " cloud MQTT hostname/time readiness checks\n";
}
