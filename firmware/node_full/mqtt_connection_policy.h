#pragma once

#include <stddef.h>
#include <stdint.h>
#include <string.h>

// Cloud TLS connects by DNS name so the same name is used for SNI and X.509
// identity validation. Reject URLs, host:port strings, IP literals and malformed
// labels before starting any network operation.
inline bool mqttCloudHostnameValid(const char* host) {
  if (!host) return false;
  const size_t length = strlen(host);
  if (length < 3 || length > 253) return false;
  size_t labelLength = 0;
  bool hasDot = false, hasNonNumericLabel = false;
  for (size_t i = 0; i < length; ++i) {
    const char c = host[i];
    if (c == '.') {
      if (labelLength == 0 || host[i - 1] == '-') return false;
      hasDot = true;
      labelLength = 0;
      continue;
    }
    const bool letter = (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z');
    const bool digit = c >= '0' && c <= '9';
    if (!letter && !digit && c != '-') return false;
    if (labelLength == 0 && c == '-') return false;
    if (++labelLength > 63) return false;
    if (!digit) hasNonNumericLabel = true;
  }
  return hasDot && hasNonNumericLabel && labelLength > 0 && host[length - 1] != '-';
}

inline bool mqttTlsClockReady(int64_t unixSeconds) {
  // This is only a readiness floor (2024-01-01 UTC), never a replacement clock.
  // BearSSL still checks the certificate's actual validity dates using SNTP time.
  return unixSeconds >= INT64_C(1704067200);
}
