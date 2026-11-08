import { describe, expect, it } from 'vitest'
import { mqttOperationSchema } from '@/features/nodes/mqtt'

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

describe('thao tác MQTT khi ngừng sử dụng node', () => {
  it('đọc được thao tác chưa hoàn tất', () => {
    expect(mqttOperationSchema.parse(incomplete).status).toBe('incomplete')
  })
})
