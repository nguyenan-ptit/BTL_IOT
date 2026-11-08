import { describe, expect, it } from 'vitest'
import {
  failedSteps,
  generateMqttPassword,
  mqttOperationSchema,
  mqttPasswordSchema,
} from '@/features/nodes/mqtt'

// Ví dụ "incomplete" trong docs/LONG_API.md, bổ sung các cột của bảng mqtt_operations.
const incomplete = {
  operation_id: '0123456789abcdef0123456789abcdef',
  device_id: 'node03',
  room_id: '103',
  requested_by: 1001,
  action: 'revoke',
  status: 'incomplete',
  target_username: null,
  subject_usernames: ['node03-reference'],
  steps: { backend_blocked: 'succeeded', capabilities: 'failed' },
  error_code: 'emqx_http_403',
  message: 'Chưa hoàn tất tại EMQX; backend vẫn chặn node. Có thể thử lại.',
  created_at: '2026-11-08T03:00:00+00:00',
  finished_at: null,
}

describe('tài khoản MQTT của node', () => {
  it('tạo mật khẩu 24 ký tự chữ và số, mỗi lần khác nhau', () => {
    const a = generateMqttPassword()
    const b = generateMqttPassword()
    expect(a).toMatch(/^[A-Za-z0-9]{24}$/)
    expect(a).not.toBe(b)
  })

  it('mật khẩu 16–128 ký tự', () => {
    expect(mqttPasswordSchema.safeParse('a'.repeat(15)).success).toBe(false)
    expect(mqttPasswordSchema.safeParse('a'.repeat(16)).success).toBe(true)
    expect(mqttPasswordSchema.safeParse('a'.repeat(129)).success).toBe(false)
  })

  it('đọc được thao tác chưa hoàn tất và liệt kê bước lỗi', () => {
    const op = mqttOperationSchema.parse(incomplete)
    expect(op.status).toBe('incomplete')
    expect(failedSteps(op)).toEqual(['capabilities'])
  })
})
