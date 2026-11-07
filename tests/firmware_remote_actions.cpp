// Tests actual firmware command/timer/discovery code with independent OpenSSL
// HMAC vectors. No ESP, LAN discovery service or production broker is contacted.
#include <cassert>
#include <iostream>
#include <string>
#include <openssl/hmac.h>
#include <openssl/evp.h>
#include "../firmware/node_full/buzzer_test.h"
#include "../firmware/node_full/broker_discovery.h"

static const char* REQUEST = "0123456789abcdef0123456789abcdef";
static const char* BOOT = "0123456789abcdef";
static const char* NONCE = "0123456789abcdef0123456789abcdef";
static const char* TEST_KEY = "0000000000000000000000000000000000000000000000000000000000000000";
static const char* TEST_MAC = "36ad61a35bba7bd81e07d60400d602df8f34d640e72dc77716aced47ccbf9dc0";

void nativeHmac(const char* key, size_t keyLength, const char* message,
                 size_t messageLength, uint8_t output[32]) {
  unsigned length = 0;
  assert(HMAC(EVP_sha256(), key, static_cast<int>(keyLength),
      reinterpret_cast<const unsigned char*>(message), messageLength, output, &length));
  assert(length == 32);
}

std::string replace(std::string value, const std::string& before, const std::string& after) {
  const auto at = value.find(before);
  assert(at != std::string::npos);
  return value.replace(at, before.size(), after);
}

std::string buzzerCommand() {
  return std::string("{\"request_id\":\"") + REQUEST + "\",\"boot_id\":\"" + BOOT +
      "\",\"expected_seq\":0,\"expires_uptime_s\":120,\"action\":\"start\"}";
}

std::string discoveryResponse() {
  return std::string("{\"v\":1,\"kind\":\"fire-alarm-broker\",\"nonce\":\"") + NONCE +
      "\",\"host\":\"192.168.0.106\",\"port\":1884,\"mac\":\"" + TEST_MAC + "\"}";
}

bool parseBuzzer(const std::string& value, BuzzerTestCommand& result) {
  return parseBuzzerTestCommand(value.data(), value.size(), result);
}

bool parseDiscovery(const std::string& value, BrokerDiscoveryResponse& result) {
  return parseBrokerDiscoveryResponse(value.data(), value.size(), result);
}

int main() {
  unsigned cases = 0;
  BuzzerTestCommand command = {};
  assert(parseBuzzer(buzzerCommand(), command)); ++cases;
  assert(command.start && command.expectedSeq == 0 && command.expiresUptimeS == 120); ++cases;
  assert(parseBuzzer(replace(buzzerCommand(), "\"start\"", "\"stop\""), command) && !command.start); ++cases;
  const std::string invalidBuzzer[] = {
      replace(buzzerCommand(), "\"expected_seq\":0", "\"expected_seq\":true"),
      replace(buzzerCommand(), "\"expected_seq\":0", "\"expected_seq\":0.0"),
      replace(buzzerCommand(), "\"expected_seq\":0", "\"expected_seq\":-1"),
      replace(buzzerCommand(), "\"expected_seq\":0", "\"expected_seq\":4294967296"),
      replace(buzzerCommand(), "\"expected_seq\":0", "\"expected_seq\":0,\"duration_ms\":9000"),
      replace(buzzerCommand(), "\"expires_uptime_s\":120", "\"expires_uptime_s\":true"),
      replace(buzzerCommand(), "\"expires_uptime_s\":120", "\"expires_uptime_s\":120.0"),
      replace(buzzerCommand(), "\"expires_uptime_s\":120", "\"expires_uptime_s\":18446744073709551616"),
      replace(buzzerCommand(), "\"start\"", "true"),
      replace(buzzerCommand(), "\"start\"", "\"START\""),
      replace(buzzerCommand(), "\"start\"", "\"toggle\""),
      replace(buzzerCommand(), REQUEST, "0123456789abcdef0123456789abcdeG"),
      replace(buzzerCommand(), BOOT, "short"),
      replace(buzzerCommand(), "\"action\":\"start\"", "\"action\":\"start\",\"action\":\"stop\""),
      replace(buzzerCommand(), "\"action\":\"start\"", "\"action\":\"start\","),
      replace(buzzerCommand(), "\"action\"", "\"act\\u0069on\""),
      buzzerCommand() + "{}", buzzerCommand() + "garbage", std::string(513, ' '),
  };
  for (const auto& value : invalidBuzzer) { assert(!parseBuzzer(value, command)); ++cases; }
  assert(parseBuzzer(buzzerCommand(), command)); ++cases;
  BuzzerTestController buzzer;
  assert(buzzer.commandSeq == 0 && !buzzer.active && !buzzer.outputEnabled(false) &&
      buzzer.outputEnabled(true) && std::string(buzzer.statusName()) == "idle"); ++cases;
  assert(buzzer.accept(command, BOOT, 100, 100, false)); ++cases;
  assert(buzzer.active && buzzer.commandSeq == 1 && buzzer.remainingMs(100) == 3000 &&
      buzzer.outputEnabled(false)); ++cases;
  assert(!buzzer.accept(command, BOOT, 100, 500, false)); ++cases;
  command.expectedSeq = 1;
  assert(!buzzer.accept(command, BOOT, 100, 500, false)); ++cases;
  strcpy(command.requestId, "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
  assert(buzzer.accept(command, BOOT, 100, 1000, false)); ++cases;
  assert(buzzer.commandSeq == 2 && buzzer.remainingMs(1000) == 2100); ++cases;
  assert(!buzzer.update(3099, false) && buzzer.remainingMs(3099) == 1); ++cases;
  assert(buzzer.active && buzzer.telemetryRemainingMs(3100) == 1); ++cases;
  assert(buzzer.update(3100, false) && !buzzer.active && buzzer.remainingMs(3100) == 0 &&
      buzzer.commandSeq == 2 && std::string(buzzer.statusName()) == "completed"); ++cases;
  assert(buzzer.telemetryRemainingMs(3100) == 0); ++cases;

  assert(parseBuzzer(buzzerCommand(), command)); ++cases;
  BuzzerTestController alarmTest;
  assert(alarmTest.accept(command, BOOT, 100, 100, true) && !alarmTest.active &&
      std::string(alarmTest.statusName()) == "blocked" && alarmTest.outputEnabled(true)); ++cases;
  command.expectedSeq = 1; command.start = false;
  strcpy(command.requestId, "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb");
  assert(alarmTest.accept(command, BOOT, 100, 200, true) && !alarmTest.active &&
      std::string(alarmTest.statusName()) == "stopped" && alarmTest.outputEnabled(true)); ++cases;
  command.expectedSeq = 2; command.start = true;
  strcpy(command.requestId, "cccccccccccccccccccccccccccccccc");
  assert(alarmTest.accept(command, BOOT, 100, 300, false) && alarmTest.active); ++cases;
  assert(alarmTest.update(400, true) && !alarmTest.active && alarmTest.outputEnabled(true) &&
      std::string(alarmTest.statusName()) == "interrupted"); ++cases;
  command.expectedSeq = 3; command.start = false;
  strcpy(command.requestId, "dddddddddddddddddddddddddddddddd");
  assert(alarmTest.accept(command, BOOT, 100, 500, false) && !alarmTest.outputEnabled(false)); ++cases;
  assert(parseBuzzer(buzzerCommand(), command)); ++cases;
  BuzzerTestController replay;
  assert(!replay.accept(command, "abcdef0123456789", 100, 0, false)); ++cases;
  assert(!replay.accept(command, BOOT, 120, 0, false)); ++cases;
  assert(!replay.accept(command, BOOT, 74, 0, false)); ++cases;
  assert(replay.accept(command, BOOT, 75, UINT32_MAX - 1000, false)); ++cases;
  assert(!replay.update(1998, false) && replay.remainingMs(1998) == 1); ++cases;
  assert(replay.update(1999, false) && !replay.active); ++cases;
  replay.commandSeq = UINT32_MAX; command.expectedSeq = UINT32_MAX;
  strcpy(command.requestId, "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee");
  assert(!replay.accept(command, BOOT, 100, 0, false)); ++cases;

  // Test the exact output-selection helper used for GPIO writes AND telemetry.
  // In particular, restoring a saved pre-test colour would fail these cases
  // where the sensor state changes while the output test is running.
  const auto normalOutputs = selectDeviceOutputs(SystemState::NORMAL, false, 100);
  assert(!normalOutputs.redHigh && normalOutputs.greenHigh && !normalOutputs.buzzerOn &&
      std::string(normalOutputs.ledName) == "green"); ++cases;
  const auto faultOutputs = selectDeviceOutputs(SystemState::FAULT, false, 100);
  assert(faultOutputs.redHigh && faultOutputs.greenHigh && !faultOutputs.buzzerOn &&
      std::string(faultOutputs.ledName) == "yellow"); ++cases;
  const auto alarmOnPhase = selectDeviceOutputs(SystemState::ALARM, false, 100);
  const auto alarmOffPhase = selectDeviceOutputs(SystemState::ALARM, false, 350);
  assert(alarmOnPhase.redHigh && !alarmOffPhase.redHigh && !alarmOnPhase.greenHigh &&
      !alarmOffPhase.greenHigh && alarmOnPhase.buzzerOn && alarmOffPhase.buzzerOn &&
      std::string(alarmOnPhase.ledName) == "red_blink"); ++cases;
  BuzzerTestCommand outputCommand = {};
  assert(parseBuzzer(buzzerCommand(), outputCommand)); ++cases;
  BuzzerTestController outputTest;
  SystemState currentSensorState = SystemState::NORMAL;
  assert(outputTest.accept(outputCommand, BOOT, 100, 100, false)); ++cases;
  const auto testOnPhase = selectDeviceOutputs(currentSensorState, outputTest.active, 100);
  const auto testOffPhase = selectDeviceOutputs(currentSensorState, outputTest.active, 350);
  assert(testOnPhase.redHigh && !testOffPhase.redHigh && !testOnPhase.greenHigh &&
      !testOffPhase.greenHigh && testOnPhase.buzzerOn && testOffPhase.buzzerOn &&
      std::string(testOnPhase.ledName) == "red_blink" && currentSensorState == SystemState::NORMAL); ++cases;
  currentSensorState = SystemState::FAULT;
  const auto faultDuringTest = selectDeviceOutputs(currentSensorState, outputTest.active, 500);
  assert(faultDuringTest.redHigh && !faultDuringTest.greenHigh && faultDuringTest.buzzerOn &&
      std::string(faultDuringTest.ledName) == "red_blink" && currentSensorState == SystemState::FAULT); ++cases;
  outputCommand.expectedSeq = 1; outputCommand.start = false;
  strcpy(outputCommand.requestId, "11111111111111111111111111111111");
  assert(outputTest.accept(outputCommand, BOOT, 100, 600, false)); ++cases;
  const auto restoredFault = selectDeviceOutputs(currentSensorState, outputTest.active, 600);
  assert(restoredFault.redHigh && restoredFault.greenHigh && !restoredFault.buzzerOn &&
      std::string(restoredFault.ledName) == "yellow"); ++cases;
  outputCommand.expectedSeq = 2; outputCommand.start = true;
  strcpy(outputCommand.requestId, "22222222222222222222222222222222");
  assert(outputTest.accept(outputCommand, BOOT, 100, 700, false)); ++cases;
  const auto newTestFromFault = selectDeviceOutputs(currentSensorState, outputTest.active, 700);
  assert(!newTestFromFault.greenHigh && newTestFromFault.buzzerOn &&
      std::string(newTestFromFault.ledName) == "red_blink"); ++cases;
  currentSensorState = SystemState::NORMAL;
  assert(outputTest.update(3700, false) && !outputTest.active); ++cases;
  const auto restoredNormal = selectDeviceOutputs(currentSensorState, outputTest.active, 3700);
  assert(!restoredNormal.redHigh && restoredNormal.greenHigh && !restoredNormal.buzzerOn &&
      std::string(restoredNormal.ledName) == "green"); ++cases;
  outputCommand.expectedSeq = 3; outputCommand.start = true;
  strcpy(outputCommand.requestId, "33333333333333333333333333333333");
  assert(outputTest.accept(outputCommand, BOOT, 100, 4000, false)); ++cases;
  currentSensorState = SystemState::ALARM;
  assert(outputTest.update(4100, true) && !outputTest.active &&
      std::string(outputTest.statusName()) == "interrupted"); ++cases;
  const auto realAlarmAfterInterruption = selectDeviceOutputs(currentSensorState, outputTest.active, 4100);
  assert(realAlarmAfterInterruption.redHigh && !realAlarmAfterInterruption.greenHigh &&
      realAlarmAfterInterruption.buzzerOn && std::string(realAlarmAfterInterruption.ledName) == "red_blink"); ++cases;
  outputCommand.expectedSeq = 4; outputCommand.start = false;
  strcpy(outputCommand.requestId, "44444444444444444444444444444444");
  assert(outputTest.accept(outputCommand, BOOT, 100, 4200, true)); ++cases;
  const auto realAlarmAfterStop = selectDeviceOutputs(currentSensorState, outputTest.active, 4200);
  assert(realAlarmAfterStop.redHigh && !realAlarmAfterStop.greenHigh && realAlarmAfterStop.buzzerOn &&
      std::string(realAlarmAfterStop.ledName) == "red_blink"); ++cases;
  outputCommand.expectedSeq = 5; outputCommand.start = true;
  strcpy(outputCommand.requestId, "55555555555555555555555555555555");
  assert(outputTest.accept(outputCommand, BOOT, 100, 4300, true) && !outputTest.active &&
      std::string(outputTest.statusName()) == "blocked"); ++cases;
  const auto blockedAlarmOutputs = selectDeviceOutputs(currentSensorState, outputTest.active, 4300);
  assert(!blockedAlarmOutputs.redHigh && !blockedAlarmOutputs.greenHigh && blockedAlarmOutputs.buzzerOn &&
      std::string(blockedAlarmOutputs.ledName) == "red_blink"); ++cases;
  currentSensorState = SystemState::NORMAL;
  const auto recoveredOutputs = selectDeviceOutputs(currentSensorState, outputTest.active, 4500);
  assert(!recoveredOutputs.redHigh && recoveredOutputs.greenHigh && !recoveredOutputs.buzzerOn &&
      std::string(recoveredOutputs.ledName) == "green"); ++cases;

  BrokerDiscoveryResponse response = {};
  assert(parseDiscovery(discoveryResponse(), response)); ++cases;
  assert(verifyBrokerDiscoveryMac(response, TEST_KEY, nativeHmac)); ++cases;
  auto tampered = response; tampered.port = 1883;
  assert(!verifyBrokerDiscoveryMac(tampered, TEST_KEY, nativeHmac)); ++cases;
  tampered = response; strcpy(tampered.host, "192.168.0.107");
  assert(!verifyBrokerDiscoveryMac(tampered, TEST_KEY, nativeHmac)); ++cases;
  tampered = response; tampered.mac[0] = 'f';
  assert(!verifyBrokerDiscoveryMac(tampered, TEST_KEY, nativeHmac)); ++cases;
  assert(!verifyBrokerDiscoveryMac(response, "1111111111111111111111111111111111111111111111111111111111111111", nativeHmac)); ++cases;
  assert(!verifyBrokerDiscoveryMac(response, "short", nativeHmac)); ++cases;
  const std::string invalidDiscovery[] = {
      replace(discoveryResponse(), "\"v\":1", "\"v\":true"),
      replace(discoveryResponse(), "\"v\":1", "\"v\":1.0"),
      replace(discoveryResponse(), "\"v\":1", "\"v\":2"),
      replace(discoveryResponse(), "fire-alarm-broker", "fire-alarm-discover"),
      replace(discoveryResponse(), "\"port\":1884", "\"port\":true"),
      replace(discoveryResponse(), "\"port\":1884", "\"port\":1884.0"),
      replace(discoveryResponse(), "\"port\":1884", "\"port\":0"),
      replace(discoveryResponse(), "\"port\":1884", "\"port\":65536"),
      replace(discoveryResponse(), "\"port\":1884", "\"port\":-1"),
      replace(discoveryResponse(), "\"port\":1884", "\"port\":1884,\"extra\":1"),
      replace(discoveryResponse(), "\"host\":\"192.168.0.106\",", ""),
      replace(discoveryResponse(), "192.168.0.106", "192.168.000.106"),
      replace(discoveryResponse(), "192.168.0.106", "192.168.0.256"),
      replace(discoveryResponse(), "192.168.0.106", "192.168.0"),
      replace(discoveryResponse(), "192.168.0.106", "192.168.0.106.1"),
      replace(discoveryResponse(), "192.168.0.106", "+192.168.0.106"),
      replace(discoveryResponse(), NONCE, "0123456789abcdef0123456789abcdeG"),
      replace(discoveryResponse(), TEST_MAC, "short"),
      replace(discoveryResponse(), "\"port\":1884", "\"port\":1884,\"port\":1883"),
      discoveryResponse() + "{}", discoveryResponse() + "x", std::string(257, ' '),
  };
  for (const auto& value : invalidDiscovery) { assert(!parseDiscovery(value, response)); ++cases; }
  assert(parseDiscovery(discoveryResponse(), response)); ++cases;
  const uint32_t local = 0xc0a8006d, broker = 0xc0a8006a, mask = 0xffffff00;
  assert(brokerSameSubnet(broker, local, mask)); ++cases;
  const uint32_t badSources[] = {local, 0xc0a80000, 0xc0a800ff, 0xc0a8016a,
      0x7f000001, 0, UINT32_MAX, 0xe0000001, 0xac200001, 0xa9fe0001};
  for (auto source : badSources) { assert(!brokerSameSubnet(source, local, mask)); ++cases; }
  assert(!brokerSameSubnet(broker, local, 0)); ++cases;
  assert(!brokerSameSubnet(broker, local, 0xffff00ff)); ++cases;
  assert(!brokerSameSubnet(broker, local, 0xfffffffe)); ++cases;
  assert(brokerSameSubnet(0x0a01020a, 0x0a01020b, mask)); ++cases;
  assert(brokerSameSubnet(0xac10020a, 0xac10020b, mask)); ++cases;
  assert(brokerSameSubnet(0xac1f020a, 0xac1f020b, mask)); ++cases;
  BrokerDiscoverySession session;
  assert(session.issue(NONCE, 100)); ++cases;
  assert(!session.accept(response, TEST_KEY, broker + 1, local, mask, 41884, 200, false, nativeHmac)); ++cases;
  assert(!session.accept(response, TEST_KEY, broker, local, mask, 41883, 200, false, nativeHmac)); ++cases;
  assert(!session.accept(response, TEST_KEY, broker, local, mask, 41884, 200, true, nativeHmac)); ++cases;
  assert(session.accept(response, TEST_KEY, broker, local, mask, 41884, 3099, false, nativeHmac)); ++cases;
  assert(!session.accept(response, TEST_KEY, broker, local, mask, 41884, 3099, false, nativeHmac)); ++cases;
  assert(session.issue(NONCE, 100)); ++cases;
  assert(!session.accept(response, TEST_KEY, broker, local, mask, 41884, 3100, false, nativeHmac)); ++cases;
  assert(session.issue("ffffffffffffffffffffffffffffffff", 100)); ++cases;
  assert(!session.accept(response, TEST_KEY, broker, local, mask, 41884, 200, false, nativeHmac)); ++cases;
  assert(session.issue(NONCE, UINT32_MAX - 100)); ++cases;
  assert(session.accept(response, TEST_KEY, broker, local, mask, 41884, 100, false, nativeHmac)); ++cases;
  assert(!session.issue("bad nonce", 0)); ++cases;
  std::cout << "PASS: " << cases << " firmware buzzer/parser/timer/discovery/HMAC/replay checks\n";
}
