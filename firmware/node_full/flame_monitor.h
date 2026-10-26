#pragma once
#include <stdint.h>

enum class FlameSupplyState { CHECKING, PRESENT, MISSING };
enum class FlameReadState { DISABLED, POWER_CHECKING, POWER_MISSING, FILTERING, OK };

// The independent supply input is checked BEFORE accepting a new DO alarm.
// This detects voltage presence at the sense point, not every module/wire fault.
class FlameMonitor {
 public:
  bool alarm = false;
  FlameSupplyState supply = FlameSupplyState::CHECKING;
  FlameReadState status = FlameReadState::POWER_CHECKING;

  constexpr FlameMonitor() = default;

  constexpr void update(uint32_t now, bool powerHigh, bool doAlarmActive,
                        bool enabled, uint32_t supplyStableMs, uint32_t doStableMs) {
    if (!supplyInitialized || powerHigh != supplyCandidate) {
      supplyInitialized = true;
      supplyCandidate = powerHigh;
      supplySince = now;
    }
    supply = static_cast<uint32_t>(now - supplySince) < supplyStableMs
        ? FlameSupplyState::CHECKING
        : powerHigh ? FlameSupplyState::PRESENT : FlameSupplyState::MISSING;

    if (!enabled) {
      status = FlameReadState::DISABLED;
      doInitialized = false;
      return;
    }
    if (supply != FlameSupplyState::PRESENT) {
      status = supply == FlameSupplyState::MISSING
          ? FlameReadState::POWER_MISSING : FlameReadState::POWER_CHECKING;
      doInitialized = false;
      return; // Preserve an already confirmed alarm; never invent one from unpowered DO.
    }
    if (!doInitialized || doAlarmActive != doCandidate) {
      doInitialized = true;
      doCandidate = doAlarmActive;
      doSince = now;
    }
    if (static_cast<uint32_t>(now - doSince) < doStableMs) {
      status = FlameReadState::FILTERING;
      return;
    }
    status = FlameReadState::OK;
    alarm = doCandidate;
  }

  constexpr bool doValid() const {
    return status == FlameReadState::OK || status == FlameReadState::FILTERING;
  }

 private:
  bool supplyInitialized = false, supplyCandidate = false;
  bool doInitialized = false, doCandidate = false;
  uint32_t supplySince = 0, doSince = 0;
};

#ifdef ALARM_POLICY_SELF_TEST
constexpr bool flameFreshPowerLossDoesNotInventAlarm() {
  FlameMonitor m;
  m.update(0, true, false, true, 300, 100);
  m.update(300, true, false, true, 300, 100);
  m.update(400, true, false, true, 300, 100);
  if (m.status != FlameReadState::OK || m.alarm) return false;
  m.update(500, false, true, true, 300, 100); // Supply and DO fall together.
  if (m.status != FlameReadState::POWER_CHECKING || m.alarm || m.doValid()) return false;
  m.update(800, false, true, true, 300, 100);
  return m.status == FlameReadState::POWER_MISSING && !m.alarm && !m.doValid();
}

constexpr bool flamePriorAlarmSurvivesPowerLossAndRecovery() {
  FlameMonitor m;
  m.update(0, true, true, true, 300, 100);
  m.update(300, true, true, true, 300, 100);
  m.update(400, true, true, true, 300, 100);
  if (!m.alarm || m.status != FlameReadState::OK) return false;
  m.update(500, false, false, true, 300, 100);
  m.update(800, false, false, true, 300, 100);
  if (!m.alarm || m.status != FlameReadState::POWER_MISSING) return false;
  m.update(900, true, false, true, 300, 100);
  m.update(1200, true, false, true, 300, 100);
  if (!m.alarm || m.status != FlameReadState::FILTERING) return false;
  m.update(1300, true, false, true, 300, 100);
  return !m.alarm && m.status == FlameReadState::OK;
}

constexpr bool flameWaitsForBothSupplyAndDo() {
  FlameMonitor m;
  m.update(0, true, true, true, 300, 100);
  m.update(299, true, true, true, 300, 100);
  if (m.alarm || m.doValid()) return false;
  m.update(300, true, true, true, 300, 100);
  m.update(399, true, true, true, 300, 100);
  if (m.alarm || m.status != FlameReadState::FILTERING) return false;
  m.update(400, true, true, true, 300, 100);
  return m.alarm && m.status == FlameReadState::OK;
}

constexpr bool flamePowerGlitchRestartsDoFilter() {
  FlameMonitor m;
  m.update(0, true, false, true, 300, 100);
  m.update(300, true, false, true, 300, 100);
  m.update(400, true, false, true, 300, 100);
  m.update(500, false, true, true, 300, 100);
  m.update(510, true, true, true, 300, 100);
  m.update(800, true, false, true, 300, 100);
  if (m.alarm || m.doValid()) return false;
  m.update(810, true, false, true, 300, 100);
  m.update(910, true, false, true, 300, 100);
  return !m.alarm && m.status == FlameReadState::OK;
}

constexpr bool flameUnpoweredBootStaysFault() {
  FlameMonitor m;
  m.update(0, false, true, true, 300, 100);
  m.update(1000, false, true, true, 300, 100);
  return !m.alarm && !m.doValid() && m.status == FlameReadState::POWER_MISSING;
}

constexpr bool flameTimersSurviveMillisWrap() {
  FlameMonitor m;
  m.update(0xFFFFFFFFu - 200u, true, false, true, 300, 100);
  m.update(99u, true, false, true, 300, 100);
  if (m.status != FlameReadState::FILTERING) return false;
  m.update(199u, true, false, true, 300, 100);
  return !m.alarm && m.status == FlameReadState::OK;
}

static_assert(flameFreshPowerLossDoesNotInventAlarm(), "Unpowered DO must not invent fire");
static_assert(flamePriorAlarmSurvivesPowerLossAndRecovery(), "Hold confirmed fire through supply fault");
static_assert(flameWaitsForBothSupplyAndDo(), "Check power before starting DO confirmation");
static_assert(flamePowerGlitchRestartsDoFilter(), "Supply glitch invalidates DO immediately");
static_assert(flameUnpoweredBootStaysFault(), "No power on boot -> fault, not fire");
static_assert(flameTimersSurviveMillisWrap(), "Flame timing works across millis wrap");
#endif
