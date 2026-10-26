import { describe, expect, it } from 'vitest'
import { allowedActions, nextLifecycle } from '@/features/nodes/transitions'

describe('vòng đời node', () => {
  it('Đã đăng ký: chỉ kích hoạt hoặc ngừng sử dụng, không chuyển thẳng sang bảo trì', () => {
    expect(allowedActions('registered')).toEqual(['activate', 'retire'])
    expect(nextLifecycle('registered', 'maintain')).toBeNull()
  })

  it('Đang sử dụng ↔ Bảo trì', () => {
    expect(nextLifecycle('active', 'maintain')).toBe('maintenance')
    expect(nextLifecycle('maintenance', 'activate')).toBe('active')
    expect(nextLifecycle('active', 'activate')).toBeNull()
  })

  it('mọi trạng thái trừ Ngừng sử dụng đều ngừng được', () => {
    for (const s of ['registered', 'active', 'maintenance'] as const) {
      expect(nextLifecycle(s, 'retire')).toBe('retired')
    }
  })

  it('Ngừng sử dụng là trạng thái cuối, không còn thao tác', () => {
    expect(allowedActions('retired')).toEqual([])
  })
})
