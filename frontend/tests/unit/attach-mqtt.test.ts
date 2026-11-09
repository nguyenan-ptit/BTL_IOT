import { describe, expect, it } from 'vitest'
import { mqttSyncStatusSchema } from '@/features/devices/schemas'
import { attachMqttFormSchema, canAttachExistingMqtt } from '@/features/nodes/schemas'
import type { NodeListItem } from '@/features/nodes/schemas'
import { mqttSyncLabel } from '@/features/nodes/transitions'

const node: NodeListItem = {
  id: 'node03',
  name: 'Node phòng 103',
  roomId: '103',
  roomName: 'Phòng 103',
  lifecycle: 'registered',
  credential: 'pending',
  mqttSync: 'unknown',
  connectivity: 'offline',
  lastSeenAt: null,
  operationId: null,
  maintenanceNote: null,
}

describe('xác nhận tài khoản MQTT có sẵn', () => {
  it('backend có thêm trạng thái manual_verified', () => {
    expect(mqttSyncStatusSchema.safeParse('manual_verified').success).toBe(true)
    expect(mqttSyncLabel.manual_verified).toBe('Đã xác nhận MQTT thủ công')
  })

  it('chỉ áp dụng cho node đang chờ cấp lần đầu', () => {
    expect(canAttachExistingMqtt(node)).toBe(true)
    expect(canAttachExistingMqtt({ ...node, lifecycle: 'provisioned' })).toBe(true)
    expect(canAttachExistingMqtt({ ...node, credential: 'active' })).toBe(false)
    expect(canAttachExistingMqtt({ ...node, mqttSync: 'failed' })).toBe(false)
    expect(canAttachExistingMqtt({ ...node, operationId: 'a'.repeat(32) })).toBe(false)
    expect(canAttachExistingMqtt({ ...node, lifecycle: 'active' })).toBe(false)
  })

  it('phải tick đủ hai ô và ghi chú 10–500 ký tự', () => {
    const ok = {
      connection_checked: true,
      topic_permissions_checked: true,
      verification_note: '  Đã kiểm tra ESP kết nối đúng tài khoản.  ',
    }
    expect(attachMqttFormSchema.parse(ok).verification_note).toBe(
      'Đã kiểm tra ESP kết nối đúng tài khoản.',
    )
    expect(attachMqttFormSchema.safeParse({ ...ok, connection_checked: false }).success).toBe(false)
    expect(
      attachMqttFormSchema.safeParse({ ...ok, topic_permissions_checked: false }).success,
    ).toBe(false)
    expect(attachMqttFormSchema.safeParse({ ...ok, verification_note: '  ngắn  ' }).success).toBe(
      false,
    )
    expect(
      attachMqttFormSchema.safeParse({ ...ok, verification_note: 'a'.repeat(501) }).success,
    ).toBe(false)
  })
})
