import { describe, expect, it } from 'vitest'
import { telemetrySchema } from '@/features/devices/schemas'
import { computeRoomOverall } from '@/features/rooms/overall'
import type { RoomStatus } from '@/features/rooms/schemas'
import { GAS_MIN_VALID, sensorViews } from '@/features/rooms/sensors'
import normal from '../fixtures/telemetry-normal.json'

function status(gas: number | null, gasHealth: 'ok' | 'fault' = 'ok'): RoomStatus {
  return {
    room: { id: '101', name: '101', boardingHouseId: '1' },
    node: {
      id: 'node01',
      code: 'Node phòng 101',
      lifecycle: 'active',
      connectivity: 'online',
      lastSeenAt: '2026-11-09T03:00:00+00:00',
    },
    sensors: [
      { kind: 'gas', health: gasHealth, value: gas },
      { kind: 'temperature', health: 'ok', value: 28.5 },
      { kind: 'flame', health: 'ok', value: false },
    ],
    activeIncidentId: null,
    hazardSigns: [],
  }
}

const base = telemetrySchema.parse({ ...normal, device_id: 'node01' })
const warming = telemetrySchema.parse({
  ...normal,
  device_id: 'node01',
  mq2: { ...normal.mq2, health: 'warming_up', adc_raw: null, warmup_remaining_s: 45 },
})

describe('trạng thái cảm biến gas/khói', () => {
  it('MQ-2 đang làm nóng: không phải lỗi, kèm số giây còn lại', () => {
    // /api/rooms/status báo "fault" khi làm nóng; telemetry của /api/devices cho biết lý do thật.
    const gas = sensorViews(status(null, 'fault'), warming)[0]
    expect(gas).toMatchObject({ kind: 'gas', state: 'warming_up', warmupRemainingS: 45 })
    expect(computeRoomOverall(status(null, 'fault'), warming)).toBe('normal')
  })

  it(`số đo dưới ${GAS_MIN_VALID} là lỗi cảm biến`, () => {
    expect(sensorViews(status(12), base)[0]?.state).toBe('low_signal')
    expect(computeRoomOverall(status(12), base)).toBe('sensor_fault')
    expect(sensorViews(status(GAS_MIN_VALID), base)[0]?.state).toBe('ok')
  })

  it('không có telemetry thì dùng đúng trạng thái của /api/rooms/status', () => {
    expect(sensorViews(status(null, 'fault'), null)[0]?.state).toBe('fault')
    expect(computeRoomOverall(status(null, 'fault'), null)).toBe('sensor_fault')
    expect(computeRoomOverall(status(200), null)).toBe('normal')
  })

  it('bỏ qua telemetry của node khác', () => {
    const other = telemetrySchema.parse({ ...warming, device_id: 'node02' })
    expect(sensorViews(status(null, 'fault'), other)[0]?.state).toBe('fault')
  })
})
