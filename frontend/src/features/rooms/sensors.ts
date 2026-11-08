import type { Telemetry } from '@/features/devices/schemas'
import type { RoomStatus, SensorReading } from './schemas'

/**
 * Số đo gas/khói (ADC MQ-2) dưới mức này coi là lỗi cảm biến: MQ-2 còn nguồn và dây tín hiệu
 * luôn đọc ra giá trị nền cao hơn, nên số gần 0 thường là tuột dây hoặc mất nguồn.
 */
export const GAS_MIN_VALID = 20

export type SensorState = 'ok' | 'fault' | 'warming_up' | 'low_signal'

export type SensorView = {
  kind: SensorReading['kind']
  value: SensorReading['value']
  state: SensorState
  /** Chỉ có khi MQ-2 đang làm nóng. */
  warmupRemainingS: number | null
}

/** Lỗi thật (có tính vào trạng thái "Lỗi cảm biến"). Làm nóng không phải lỗi. */
export function isFault(state: SensorState): boolean {
  return state === 'fault' || state === 'low_signal'
}

/**
 * Trạng thái hiển thị của từng cảm biến.
 * /api/rooms/status gộp mọi health khác "ok" thành "fault", kể cả lúc MQ-2 đang làm nóng,
 * nên ghép thêm telemetry gốc từ /api/devices (data.mq2.health, warmup_remaining_s) cho đúng.
 */
export function sensorViews(status: RoomStatus, telemetry: Telemetry | null): SensorView[] {
  const own = telemetry && status.node && telemetry.device_id === status.node.id ? telemetry : null
  return status.sensors.map((sensor) => {
    const view: SensorView = {
      kind: sensor.kind,
      value: sensor.value,
      state: sensor.health,
      warmupRemainingS: null,
    }
    if (sensor.kind !== 'gas') return view
    if (own?.mq2.health === 'warming_up') {
      return {
        ...view,
        state: 'warming_up',
        value: null,
        warmupRemainingS: own.mq2.warmup_remaining_s ?? null,
      }
    }
    if (sensor.health === 'ok' && sensor.value !== null && sensor.value < GAS_MIN_VALID) {
      return { ...view, state: 'low_signal' }
    }
    return view
  })
}
