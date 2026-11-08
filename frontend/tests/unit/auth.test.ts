import { describe, expect, it } from 'vitest'
import { editUserFormSchema } from '@/features/accounts/schemas'
import { changePasswordFormSchema, loginResponseSchema } from '@/features/auth/schemas'

// Đúng hình response của POST /api/auth/login (backend/app/api/routes/auth.py + core/user_view.py).
const loginResponse = {
  accessToken: 'eyJhbGciOiJIUzI1NiJ9.x.y',
  tokenType: 'Bearer',
  expiresIn: 3600,
  user: {
    id: '1001',
    username: 'chutro',
    displayName: 'Chủ trọ',
    role: 'landlord',
    scope: { boardingHouseIds: ['1'], roomIds: [] },
    locked: false,
    createdAt: '2026-11-06T00:00:00+00:00',
    permissions: ['incidents:acknowledge', 'thresholds:manage'],
  },
}

describe('đăng nhập', () => {
  it('đọc được response đăng nhập của backend', () => {
    const parsed = loginResponseSchema.parse(loginResponse)
    expect(parsed.user.role).toBe('landlord')
    expect(parsed.accessToken).toBe(loginResponse.accessToken)
  })

  it('từ chối response thiếu accessToken', () => {
    const { accessToken: _omit, ...rest } = loginResponse
    expect(loginResponseSchema.safeParse(rest).success).toBe(false)
  })
})

describe('đổi mật khẩu', () => {
  const ok = { currentPassword: 'cu-12345', newPassword: 'moi-12345', confirmPassword: 'moi-12345' }

  it('nhận bộ hợp lệ', () => {
    expect(changePasswordFormSchema.safeParse(ok).success).toBe(true)
  })

  it('mật khẩu mới ít nhất 8 ký tự', () => {
    const r = changePasswordFormSchema.safeParse({
      ...ok,
      newPassword: '1234567',
      confirmPassword: '1234567',
    })
    expect(r.success).toBe(false)
  })

  it('nhập lại phải khớp', () => {
    const r = changePasswordFormSchema.safeParse({ ...ok, confirmPassword: 'khac-12345' })
    expect(r.error?.issues[0]?.path).toEqual(['confirmPassword'])
    expect(r.error?.issues[0]?.message).toBe('Mật khẩu nhập lại không khớp.')
  })
})

describe('form tài khoản theo backend', () => {
  it('tên hiển thị tối đa 100 ký tự', () => {
    const r = editUserFormSchema.safeParse({
      displayName: 'a'.repeat(101),
      role: 'admin',
      boardingHouseIds: [],
      roomIds: [],
    })
    expect(r.success).toBe(false)
  })
})
