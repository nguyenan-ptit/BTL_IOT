#pragma once

#include <ESP8266WiFi.h>
#include <WiFiUdp.h>
#include <bearssl/bearssl.h>
#include "broker_discovery.h"

inline void espBrokerDiscoveryHmac(const char* key, size_t keyLength,
    const char* message, size_t messageLength, uint8_t output[32]) {
  br_hmac_key_context keyContext;
  br_hmac_context context;
  br_hmac_key_init(&keyContext, &br_sha256_vtable, key, keyLength);
  br_hmac_init(&context, &keyContext, 32);
  br_hmac_update(&context, message, messageLength);
  br_hmac_out(&context, output);
}

inline uint32_t discoveryIpv4(const IPAddress& address) {
  return static_cast<uint32_t>(address[0]) << 24 | static_cast<uint32_t>(address[1]) << 16 |
      static_cast<uint32_t>(address[2]) << 8 | static_cast<uint32_t>(address[3]);
}

class EspBrokerDiscovery {
 public:
  explicit EspBrokerDiscovery(const char* sharedKey) : key(sharedKey) {}

  bool enabled() const { return thresholdHex(key, 64); }

  bool service(uint32_t now, bool mqttConnected, IPAddress& broker, uint16_t& port) {
    if (!enabled() || mqttConnected || WiFi.status() != WL_CONNECTED) {
      if (socketStarted) udp.stop();
      socketStarted = false;
      hasProbed = false;
      session.pending = false;
      return false;
    }
    if (!socketStarted) {
      if (hasProbed && now - lastProbeMs < BROKER_DISCOVERY_INTERVAL_MS) return false;
      if (!udp.begin(BROKER_DISCOVERY_LOCAL_PORT)) {
        hasProbed = true;
        lastProbeMs = now;
        return false;
      }
      socketStarted = true;
      hasProbed = false;
    }
    // Process at most two datagrams per pass. parsePacket advances/discards the
    // previous datagram, so an oversized packet cannot create an unbounded read.
    for (unsigned processed = 0; processed < 2; ++processed) {
      const int length = udp.parsePacket();
      if (length <= 0) break;
      const IPAddress source = udp.remoteIP();
      const uint16_t sourcePort = udp.remotePort();
      char bytes[BROKER_DISCOVERY_RESPONSE_MAX + 1];
      const int received = udp.read(bytes, sizeof(bytes) - 1);
      if (length > static_cast<int>(BROKER_DISCOVERY_RESPONSE_MAX) || received != length) continue;
      BrokerDiscoveryResponse response;
      if (!parseBrokerDiscoveryResponse(bytes, static_cast<size_t>(received), response)) continue;
      if (session.accept(response, key, discoveryIpv4(source), discoveryIpv4(WiFi.localIP()),
          discoveryIpv4(WiFi.subnetMask()), sourcePort, now, mqttConnected, espBrokerDiscoveryHmac)) {
        broker = source;
        port = response.port;
        return true;
      }
    }
    if (!hasProbed || now - lastProbeMs >= BROKER_DISCOVERY_INTERVAL_MS) {
      hasProbed = true;
      lastProbeMs = now;
      char nonce[33];
      snprintf(nonce, sizeof(nonce), "%08lx%08lx%08lx%08lx",
          static_cast<unsigned long>(os_random()), static_cast<unsigned long>(os_random()),
          static_cast<unsigned long>(os_random()), static_cast<unsigned long>(os_random()));
      session.issue(nonce, now);
      char query[128];
      const int length = snprintf(query, sizeof(query),
          "{\"v\":1,\"kind\":\"fire-alarm-discover\",\"nonce\":\"%s\"}", nonce);
      const uint32_t broadcast = discoveryIpv4(WiFi.localIP()) | ~discoveryIpv4(WiFi.subnetMask());
      const IPAddress destination(static_cast<uint8_t>(broadcast >> 24), static_cast<uint8_t>(broadcast >> 16),
          static_cast<uint8_t>(broadcast >> 8), static_cast<uint8_t>(broadcast));
      if (length <= 0 || static_cast<size_t>(length) >= sizeof(query) ||
          !udp.beginPacket(destination, BROKER_DISCOVERY_SERVER_PORT) ||
          udp.write(reinterpret_cast<const uint8_t*>(query), static_cast<size_t>(length)) != static_cast<size_t>(length) ||
          !udp.endPacket()) session.pending = false;
    }
    return false;
  }

 private:
  const char* key;
  WiFiUDP udp;
  BrokerDiscoverySession session;
  uint32_t lastProbeMs = 0;
  bool socketStarted = false;
  bool hasProbed = false;
};
