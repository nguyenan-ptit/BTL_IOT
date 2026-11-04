#pragma once

// Copy to mqtt_ca.h for cloud TLS mode. Replace the placeholder below with
// the exact PEM CA certificate downloaded from your MQTT provider dashboard.
// A CA certificate is public; never paste a private key or account password.
// Missing/invalid CA data disables cloud networking rather than disabling TLS checks.
static const char MQTT_TLS_CA_CERT[] PROGMEM = R"MQTT_CA(
PASTE_PROVIDER_CA_PEM_HERE
)MQTT_CA";
