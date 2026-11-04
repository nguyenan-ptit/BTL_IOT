#pragma once

#include "remote_thresholds.h"
#include <stdio.h>

constexpr uint16_t BROKER_DISCOVERY_SERVER_PORT = 41884;
constexpr uint16_t BROKER_DISCOVERY_LOCAL_PORT = 41885;
constexpr uint32_t BROKER_DISCOVERY_INTERVAL_MS = 3000;
constexpr size_t BROKER_DISCOVERY_RESPONSE_MAX = 256;

// Production uses BearSSL; native tests supply OpenSSL to verify the same
// canonical bytes, protocol validation and constant-time MAC comparison.
typedef void (*DiscoveryHmacProvider)(const char* key, size_t keyLength,
    const char* message, size_t messageLength, uint8_t output[32]);

struct BrokerDiscoveryResponse {
  char nonce[33];
  char mac[65];
  char host[16];
  uint16_t port;
};

inline bool brokerIpv4FromText(const char* text, uint32_t& address) {
  if (!text || !*text) return false;
  uint32_t parsed = 0;
  for (unsigned part = 0; part < 4; ++part) {
    unsigned value = 0, digits = 0;
    const bool leadingZero = *text == '0';
    while (*text >= '0' && *text <= '9') {
      value = value * 10 + static_cast<unsigned>(*text++ - '0');
      if (++digits > 3 || value > 255) return false;
    }
    if (!digits || (leadingZero && digits > 1)) return false;
    parsed = (parsed << 8) | value;
    if (part < 3) { if (*text++ != '.') return false; }
    else if (*text != '\0') return false;
  }
  address = parsed;
  return true;
}

inline bool parseBrokerDiscoveryResponse(const char* raw, size_t length, BrokerDiscoveryResponse& result) {
  static const char* const keys[] = {"v", "kind", "nonce", "host", "port", "mac"};
  if (length > BROKER_DISCOVERY_RESPONSE_MAX || !thresholdJsonEnvelope(raw, length, keys, 6)) return false;
  StaticJsonDocument<512> document;
  if (deserializeJson(document, raw, length, DeserializationOption::NestingLimit(2))) return false;
  const JsonObjectConst object = document.as<JsonObjectConst>();
  if (object.size() != 6 || !object["v"].is<int>() || object["v"].as<int>() != 1 ||
      !object["kind"].is<const char*>() || strcmp(object["kind"], "fire-alarm-broker") != 0 ||
      !object["nonce"].is<const char*>() || !thresholdHex(object["nonce"], 32) ||
      !object["host"].is<const char*>() || strlen(object["host"].as<const char*>()) > 15 ||
      !object["mac"].is<const char*>() || !thresholdHex(object["mac"], 64) ||
      !object["port"].is<unsigned int>() || object["port"].as<unsigned int>() < 1 ||
      object["port"].as<unsigned int>() > 65535) return false;
  uint32_t address;
  if (!brokerIpv4FromText(object["host"].as<const char*>(), address)) return false;
  BrokerDiscoveryResponse candidate = {};
  strcpy(candidate.nonce, object["nonce"].as<const char*>());
  strcpy(candidate.mac, object["mac"].as<const char*>());
  strcpy(candidate.host, object["host"].as<const char*>());
  candidate.port = static_cast<uint16_t>(object["port"].as<unsigned int>());
  result = candidate;
  return true;
}

inline bool verifyBrokerDiscoveryMac(const BrokerDiscoveryResponse& response, const char* key,
                                     DiscoveryHmacProvider hmac) {
  if (!thresholdHex(key, 64) || !thresholdHex(response.nonce, 32) ||
      !thresholdHex(response.mac, 64) || !response.port || !hmac) return false;
  uint32_t address;
  if (!brokerIpv4FromText(response.host, address)) return false;
  char canonical[112];
  const int length = snprintf(canonical, sizeof(canonical), "fire-alarm-broker|1|%s|%s|%u",
      response.nonce, response.host, static_cast<unsigned>(response.port));
  if (length <= 0 || static_cast<size_t>(length) >= sizeof(canonical)) return false;
  uint8_t digest[32];
  hmac(key, 64, canonical, static_cast<size_t>(length), digest);
  static const char hex[] = "0123456789abcdef";
  uint8_t difference = 0;
  for (size_t i = 0; i < 32; ++i) {
    difference |= static_cast<uint8_t>(response.mac[i * 2] ^ hex[digest[i] >> 4]);
    difference |= static_cast<uint8_t>(response.mac[i * 2 + 1] ^ hex[digest[i] & 15]);
  }
  return difference == 0;
}

inline bool brokerPrivateIpv4(uint32_t address) {
  return (address & 0xff000000UL) == 0x0a000000UL ||
      (address & 0xfff00000UL) == 0xac100000UL ||
      (address & 0xffff0000UL) == 0xc0a80000UL;
}

inline bool brokerSameSubnet(uint32_t source, uint32_t local, uint32_t mask) {
  const uint32_t hostMask = ~mask;
  // A usable contiguous subnet must have at least two host bits (/30 or wider).
  if (!mask || hostMask < 3 || (hostMask & (hostMask + 1)) != 0 ||
      !brokerPrivateIpv4(source) || !brokerPrivateIpv4(local) || source == local ||
      (source & mask) != (local & mask)) return false;
  const uint32_t host = source & hostMask;
  return host != 0 && host != hostMask;
}

class BrokerDiscoverySession {
 public:
  bool pending = false;
  char nonce[33] = "";

  bool issue(const char* value, uint32_t now) {
    if (!thresholdHex(value, 32)) return false;
    strcpy(nonce, value);
    startedMs = now;
    pending = true;
    return true;
  }

  bool accept(const BrokerDiscoveryResponse& response, const char* key,
              uint32_t source, uint32_t local, uint32_t mask,
              uint16_t sourcePort, uint32_t now, bool mqttConnected,
              DiscoveryHmacProvider hmac) {
    uint32_t signedHost;
    if (!pending || mqttConnected || now - startedMs >= BROKER_DISCOVERY_INTERVAL_MS ||
        sourcePort != BROKER_DISCOVERY_SERVER_PORT || strcmp(response.nonce, nonce) != 0 ||
        !brokerIpv4FromText(response.host, signedHost) || signedHost != source ||
        !brokerSameSubnet(source, local, mask) || !verifyBrokerDiscoveryMac(response, key, hmac)) return false;
    pending = false; // A response can be adopted at most once per fresh nonce.
    return true;
  }

 private:
  uint32_t startedMs = 0;
};
