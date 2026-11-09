import { describe, expect, it } from 'vitest'
import type { DeviceItem } from '@/features/devices/schemas'
import {
  houseFormSchema,
  roomFormSchema,
  roomsWithNodes,
  suggestRoomId,
} from '@/features/houses/schemas'

describe('gợi ý mã phòng', () => {
  it('ghép mã nhà trọ với số phòng', () => {
    expect(suggestRoomId('1', 'Phòng 103')).toBe('n1-103')
    expect(suggestRoomId('2', 'P.12A')).toBe('n2-12')
  })

  it('tên không có số thì để trống', () => {
    expect(suggestRoomId('1', 'Kho')).toBe('')
  })
})

describe('form phòng và nhà trọ (theo backend/app/schemas/rooms.py)', () => {
  it('mã phòng 1–20 ký tự chữ, số, gạch dưới, gạch ngang', () => {
    expect(roomFormSchema.safeParse({ name: 'Phòng 103', id: 'n1-103' }).success).toBe(true)
    expect(roomFormSchema.safeParse({ name: 'Phòng 103', id: 'n1 103' }).success).toBe(false)
    expect(roomFormSchema.safeParse({ name: 'Phòng 103', id: 'a'.repeat(21) }).success).toBe(false)
    expect(roomFormSchema.safeParse({ name: '', id: 'n1-103' }).success).toBe(false)
  })

  it('nhà trọ bắt buộc chọn chủ trọ, địa chỉ để trống thì bỏ', () => {
    expect(houseFormSchema.safeParse({ name: 'Nhà A', address: '', landlordId: '' }).success).toBe(
      false,
    )
    const parsed = houseFormSchema.parse({ name: ' Nhà A ', address: '  ', landlordId: '1001' })
    expect(parsed).toEqual({ name: 'Nhà A', address: undefined, landlordId: '1001' })
  })
})

function device(id: string, roomId: string | null): DeviceItem {
  return {
    device_id: id,
    room_id: roomId,
    lifecycle_status: 'registered',
    credential_status: 'pending',
    data: null,
    online: false,
    received_at: null,
    can_control: false,
    device: {
      device_id: id,
      device_name: id,
      mqtt_username: id,
      mqtt_client_id: null,
      mqtt_sync_status: 'unknown',
      mqtt_operation_id: null,
      hardware_version: null,
      firmware_version: null,
      last_seen_at: null,
      maintenance_note: null,
    },
    remote_control: { supported: false, pending: null },
    buzzer_control: { supported: false, pending: null },
  }
}

describe('ghép phòng với node', () => {
  it('gom mọi node của một phòng, bỏ node chưa có phòng', () => {
    const map = roomsWithNodes([device('a', '101'), device('b', '101'), device('c', null)])
    expect(map.get('101')?.map((d) => d.device_id)).toEqual(['a', 'b'])
    expect([...map.keys()]).toEqual(['101'])
  })
})
