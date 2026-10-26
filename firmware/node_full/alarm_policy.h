#pragma once

enum class SystemState { NORMAL, FAULT, ALARM };

constexpr bool nextAnalogAlarm(bool previous, int raw, int on, int off) {
  if (raw >= on) return true;
  if (raw <= off) return false;
  return previous;
}

constexpr bool nextTemperatureAlarm(bool previous, bool valid, float value,
                                 float on, float off) {
  // A failed sensor must not silently clear a previously observed alarm.
  if (!valid) return previous;
  if (value >= on) return true;
  if (value <= off) return false;
  return previous;
}

constexpr SystemState chooseState(bool temperatureAlarm, bool gasAlarm,
                                 bool flameAlarm, bool temperatureValid,
                                 bool gasValid, bool flameValid) {
  if (temperatureAlarm || gasAlarm || flameAlarm) return SystemState::ALARM;
  if (!temperatureValid || !gasValid || !flameValid) return SystemState::FAULT;
  return SystemState::NORMAL;
}

constexpr SystemState chooseState(bool temperatureAlarm, bool gasAlarm,
                               bool temperatureValid, bool gasValid) {
  return chooseState(temperatureAlarm, gasAlarm, false, temperatureValid, gasValid, true);
}

#ifdef ALARM_POLICY_SELF_TEST
static_assert(nextAnalogAlarm(false, 60, 60, 55), "ADC at ON -> alarm");
static_assert(!nextAnalogAlarm(true, 55, 60, 55), "ADC at OFF -> clear");
static_assert(nextAnalogAlarm(true, 57, 60, 55), "ADC band holds alarm");
static_assert(!nextAnalogAlarm(false, 57, 60, 55), "ADC band holds normal");
static_assert(!nextAnalogAlarm(false, 0, 60, 55), "Zero ADC alone does not prove a fault");
static_assert(nextAnalogAlarm(false, 1023, 60, 55), "High ADC -> alarm");
static_assert(chooseState(false, false, true, true) == SystemState::NORMAL, "Healthy -> green");
static_assert(chooseState(false, false, false, true) == SystemState::FAULT, "DS failure -> yellow");
static_assert(chooseState(false, false, true, false) == SystemState::FAULT, "MQ unavailable -> yellow");
static_assert(chooseState(false, false, false, false) == SystemState::FAULT, "Both unavailable -> yellow");
static_assert(chooseState(true, false, true, false) == SystemState::ALARM, "Temperature danger beats MQ fault");
static_assert(chooseState(false, true, false, true) == SystemState::ALARM, "Gas danger beats DS fault");
static_assert(chooseState(true, true, false, false) == SystemState::ALARM, "Held alarms survive sensor faults");
static_assert(nextTemperatureAlarm(false, true, 60, 60, 55), "At ON threshold -> alarm");
static_assert(!nextTemperatureAlarm(true, true, 55, 60, 55), "At OFF threshold -> clear");
static_assert(nextTemperatureAlarm(true, true, 57, 60, 55), "Within band -> hold ON");
static_assert(!nextTemperatureAlarm(false, true, 57, 60, 55), "Within band -> hold OFF");
static_assert(nextTemperatureAlarm(true, false, -127, 60, 55), "Failure must not clear alarm");
static_assert(!nextTemperatureAlarm(false, false, -127, 60, 55), "Failure must not invent heat");
static_assert(chooseState(false,false,false,true,true,true)==SystemState::NORMAL, "All three valid -> green");
static_assert(chooseState(false,false,false,true,true,false)==SystemState::FAULT, "Flame filtering/disabled -> yellow");
static_assert(chooseState(false,false,true,false,false,true)==SystemState::ALARM, "Flame beats DS fault and MQ startup");
static_assert(chooseState(true,false,false,true,false,false)==SystemState::ALARM, "Temperature alarm beats flame fault");
static_assert(chooseState(false,true,false,false,true,false)==SystemState::ALARM, "Gas alarm beats flame fault");
static_assert(chooseState(false,false,true,false,false,false)==SystemState::ALARM, "Held flame alarm survives filtering");
#endif
