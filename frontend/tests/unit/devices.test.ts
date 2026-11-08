import { describe, expect, it } from 'vitest'
import { currentThresholds, toMeasurement, toThresholdPayload } from '@/features/devices/adapters'
import { deviceListSchema, telemetrySchema } from '@/features/devices/schemas'
// Bản tin mẫu firmware schema 6 trong repo (docs/MQTT_CONTRACT.md mục 2).
import fault from '../../../examples/telemetry-fault.json'
import normal from '../../../examples/telemetry-normal.json'
import outputTest from '../../../examples/telemetry-output-test.json'

const at = '2026-11-08T03:00:00+00:00'

describe('telemetry firmware schema 6', () => {
  it('đọc được cả ba bản tin mẫu', () => {
    for (const sample of [normal, fault, outputTest]) {
      expect(telemetrySchema.safeParse(sample).success).toBe(true)
    }
  })

  it('chuyển bản tin bình thường thành số đo', () => {
    const m = toMeasurement({
      received_at: at,
      room_id: '101',
      data: telemetrySchema.parse(normal),
    })
    expect(m).toEqual({ measuredAt: at, receivedAt: at, gas: 42, temperature: 28.5, flame: false })
  })

  it('cảm biến không ok thì giá trị là null, không hiện số cũ', () => {
    const data = telemetrySchema.parse({
      ...normal,
      temperature: { value_c: 28.5, health: 'read_error', alarm: false },
      mq2: { ...normal.mq2, health: 'warming_up' },
    })
    const m = toMeasurement({ received_at: at, room_id: '101', data })
    expect(m.temperature).toBeNull()
    expect(m.gas).toBeNull()
    expect(m.flame).toBe(false)

    const flameFault = toMeasurement({
      received_at: at,
      room_id: '101',
      data: telemetrySchema.parse(fault),
    })
    expect(flameFault.flame).toBeNull()
  })

  it('đọc ngưỡng node đang dùng', () => {
    expect(currentThresholds(telemetrySchema.parse(normal))).toEqual({
      gasOn: 60,
      gasOff: 55,
      tempOn: 60,
      tempOff: 55,
    })
  })

  it('đổi ngưỡng sang body của backend', () => {
    expect(toThresholdPayload({ gasOn: 650, gasOff: 550, tempOn: 65, tempOff: 60 })).toEqual({
      mq2_on: 650,
      mq2_off: 550,
      temperature_on_c: 65,
      temperature_off_c: 60,
    })
  })
})

describe('GET /api/devices', () => {
  it('đọc được node chưa từng gửi telemetry', () => {
    // Theo ví dụ response danh sách trong docs/LONG_API.md, cộng các trường route thêm vào.
    const response = {
      items: [
        {
          device_id: 'node03',
          room_id: '103',
          lifecycle_status: 'registered',
          credential_status: 'pending',
          data: null,
          online: false,
          connectivity: 'offline',
          received_at: null,
          sensors: [],
          can_control: false,
          device: {
            device_id: 'node03',
            device_name: 'Cảm biến phòng 103',
            mqtt_username: 'node03-reference',
            mqtt_client_id: null,
            mqtt_sync_status: 'unknown',
            mqtt_operation_id: null,
            hardware_version: 'r1',
            firmware_version: 'v6',
            last_seen_at: null,
            maintenance_note: null,
          },
          remote_control: { supported: false, pending: null },
          buzzer_control: { supported: false, pending: null },
        },
      ],
      mqtt: { connected: true },
      prototype: true,
    }
    const parsed = deviceListSchema.parse(response)
    expect(parsed.items[0]?.data).toBeNull()
  })
})
