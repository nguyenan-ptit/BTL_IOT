import { describe, expect, it } from 'vitest'
import { allowedTargets } from '@/features/nodes/transitions'

// Bảng LIFECYCLE_TRANSITIONS trong backend/app/api/routes/devices.py.
describe('vòng đời node theo backend', () => {
  it('Đang sử dụng → bảo trì, khoá hoặc ngừng sử dụng', () => {
    expect(allowedTargets('active')).toEqual(['maintenance', 'blocked', 'decommissioned'])
  })

  it('Đã khoá chỉ mở lại hoặc ngừng sử dụng', () => {
    expect(allowedTargets('blocked')).toEqual(['active', 'decommissioned'])
  })

  it('Đã đăng ký chưa kích hoạt thẳng được (phải cấp tài khoản MQTT trước)', () => {
    expect(allowedTargets('registered')).not.toContain('active')
  })

  it('Ngừng sử dụng là trạng thái cuối', () => {
    expect(allowedTargets('decommissioned')).toEqual([])
  })
})
