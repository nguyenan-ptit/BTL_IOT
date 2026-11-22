#pragma once

#include <stddef.h>

constexpr bool otaIdValid(const char* value, size_t maxLength, bool allowDot = false) {
  if (!value || !value[0]) return false;
  size_t length = 0;
  for (; value[length]; ++length) {
    if (length == maxLength) return false;
    const char c = value[length];
    if (!((c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') ||
          (c >= '0' && c <= '9') || c == '-' || c == '_' || (allowDot && c == '.')))
      return false;
  }
  return true;
}

constexpr bool otaVersionValid(const char* value) { return otaIdValid(value, 64, true); }
