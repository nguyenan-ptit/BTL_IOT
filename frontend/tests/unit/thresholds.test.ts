import { describe, expect, it } from 'vitest'
import { controlBlockReason } from '@/features/devices/adapters'
import { telemetrySchema, type DeviceItem } from '@/features/devices/schemas'
import { thresholdFormSchema } from '@/features/thresholds/schemas'
import normal from '../fixtures/telemetry-normal.json'

const ok = { gasOn: 650, gasOff: 550, tempOn: 65, tempOff: 60 }

describe('form ngưỡng cảnh báo (theo Thresholds của backend)', () => {
  it('nhận bộ ngưỡng hợp lệ', () => {
    expect(thresholdFormSchema.safeParse(ok).success).toBe(true)
  })

  it('gas bật 1–1023, gas tắt 0–1022, số nguyên', () => {
    expect(thresholdFormSchema.safeParse({ ...ok, gasOn: 0, gasOff: 0 }).success).toBe(false)
    expect(thresholdFormSchema.safeParse({ ...ok, gasOff: 1023, gasOn: 1023 }).success).toBe(false)
    expect(thresholdFormSchema.safeParse({ ...ok, gasOn: 650.5 }).success).toBe(false)
  })

  it('nhiệt độ tối đa một chữ số thập phân trong -55–125', () => {
    expect(thresholdFormSchema.safeParse({ ...ok, tempOn: 60.3 }).success).toBe(true)
    expect(thresholdFormSchema.safeParse({ ...ok, tempOn: 60.25 }).success).toBe(false)
    expect(thresholdFormSchema.safeParse({ ...ok, tempOn: 130 }).success).toBe(false)
  })

  it('chặn ngưỡng tắt lớn hơn hoặc bằng ngưỡng bật', () => {
    const r = thresholdFormSchema.safeParse({ ...ok, gasOff: 650, tempOff: 66 })
    expect(r.success).toBe(false)
    const paths = r.error?.issues.map((i) => i.path.join('.'))
    expect(paths).toEqual(expect.arrayContaining(['gasOff', 'tempOff']))
  })
})

const data = telemetrySchema.parse(normal)
const ready: DeviceItem = {
  device_id: 'node01',
  room_id: '101',
  lifecycle_status: 'active',
  credential_status: 'active',
  data,
  online: true,
  received_at: '2026-11-08T03:00:00+00:00',
  can_control: true,
  device: {
    device_id: 'node01',
    device_name: 'Node phòng 101',
    mqtt_username: 'node01',
    mqtt_client_id: null,
    mqtt_sync_status: 'unknown',
    mqtt_operation_id: null,
    hardware_version: null,
    firmware_version: null,
    last_seen_at: null,
    maintenance_note: null,
  },
  remote_control: { supported: true, pending: null },
  buzzer_control: { supported: true, pending: null },
}

describe('lý do khoá điều khiển node', () => {
  it('node đủ điều kiện thì không khoá', () => {
    expect(controlBlockReason(ready, 'thresholds')).toBeNull()
    expect(controlBlockReason(ready, 'buzzer')).toBeNull()
  })

  it('theo đúng thứ tự ưu tiên', () => {
    expect(controlBlockReason({ ...ready, data: null }, 'thresholds')).toBe(
      'Chưa có dữ liệu từ node.',
    )
    expect(controlBlockReason({ ...ready, online: false }, 'thresholds')).toBe(
      'Node đang mất kết nối.',
    )
    expect(controlBlockReason({ ...ready, can_control: false }, 'thresholds')).toBe(
      'Node chưa ở trạng thái cho phép điều khiển.',
    )
    expect(
      controlBlockReason(
        { ...ready, remote_control: { supported: false, pending: null } },
        'thresholds',
      ),
    ).toBe('Firmware chưa hỗ trợ điều khiển từ xa.')
  })

  it('đang có lệnh chờ ESP xác nhận', () => {
    const pending = {
      request_id: 'a'.repeat(32),
      status: 'pending' as const,
      thresholds: { mq2_on: 650, mq2_off: 550, temperature_on_c: 65, temperature_off_c: 60 },
      message: 'Đã gửi yêu cầu; đang chờ ESP xác nhận ngưỡng đã lưu.',
    }
    expect(
      controlBlockReason({ ...ready, remote_control: { supported: true, pending } }, 'thresholds'),
    ).toBe('Đang chờ ESP xác nhận lệnh trước.')
    // Lệnh ngưỡng đang chờ không khoá thử còi.
    expect(
      controlBlockReason({ ...ready, remote_control: { supported: true, pending } }, 'buzzer'),
    ).toBeNull()
  })
})
