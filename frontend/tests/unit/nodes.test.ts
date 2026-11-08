import { describe, expect, it } from 'vitest'
import type { DeviceItem } from '@/features/devices/schemas'
import { registerNodeFormSchema, toNodeListItem } from '@/features/nodes/schemas'

const item: DeviceItem = {
  device_id: 'node02',
  room_id: '102',
  lifecycle_status: 'maintenance',
  credential_status: 'active',
  data: null,
  online: false,
  received_at: null,
  can_control: false,
  device: {
    device_id: 'node02',
    device_name: 'Node phòng 102',
    mqtt_username: 'node02',
    mqtt_client_id: null,
    mqtt_sync_status: 'synced',
    mqtt_operation_id: '0123456789abcdef0123456789abcdef',
    hardware_version: 'r1',
    firmware_version: 'v6',
    last_seen_at: '2026-11-08T03:00:00+00:00',
    maintenance_note: 'Thay cảm biến',
  },
  remote_control: { supported: false, pending: null },
  buzzer_control: { supported: false, pending: null },
}

describe('danh sách node', () => {
  it('map item /api/devices sang dòng của bảng', () => {
    expect(toNodeListItem(item, new Map([['102', '102A']]))).toEqual({
      id: 'node02',
      name: 'Node phòng 102',
      roomId: '102',
      roomName: '102A',
      lifecycle: 'maintenance',
      credential: 'active',
      mqttSync: 'synced',
      connectivity: 'offline',
      lastSeenAt: '2026-11-08T03:00:00+00:00',
      operationId: '0123456789abcdef0123456789abcdef',
      maintenanceNote: 'Thay cảm biến',
    })
  })

  it('phòng không có trong danh sách thì hiện mã phòng', () => {
    expect(toNodeListItem({ ...item, room_id: '999' }, new Map()).roomName).toBe('999')
  })
})

describe('form đăng ký node', () => {
  const ok = {
    device_id: 'node03',
    device_name: 'Cảm biến phòng 103',
    room_id: '103',
    mqtt_username: 'node03-reference',
    mqtt_client_id: '',
    hardware_version: '',
    firmware_version: 'v6',
  }

  it('bỏ trường tuỳ chọn để trống khỏi body', () => {
    const parsed = registerNodeFormSchema.parse(ok)
    expect(parsed).toEqual({
      device_id: 'node03',
      device_name: 'Cảm biến phòng 103',
      room_id: '103',
      mqtt_username: 'node03-reference',
      firmware_version: 'v6',
    })
  })

  it('chặn mã node có dấu cách và phòng trống', () => {
    expect(registerNodeFormSchema.safeParse({ ...ok, device_id: 'node 03' }).success).toBe(false)
    expect(registerNodeFormSchema.safeParse({ ...ok, room_id: '' }).success).toBe(false)
  })
})
