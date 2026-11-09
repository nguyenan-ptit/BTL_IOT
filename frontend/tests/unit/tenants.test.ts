import { describe, expect, it } from 'vitest'
import { createTenantFormSchema, createTenantResponseSchema } from '@/features/tenants/schemas'

const ok = {
  room_id: '101',
  username: 'Thue101B',
  display_name: '  Nguyễn Văn B  ',
  password: 'matkhau-123',
  confirmPassword: 'matkhau-123',
}

// Theo CreateTenantRequest trong backend/app/schemas/accounts.py.
describe('form thêm người thuê', () => {
  it('chuẩn hoá tên đăng nhập về chữ thường và bỏ khoảng trắng ở tên hiển thị', () => {
    const parsed = createTenantFormSchema.parse(ok)
    expect(parsed.username).toBe('thue101b')
    expect(parsed.display_name).toBe('Nguyễn Văn B')
  })

  it('tên đăng nhập 3–32 ký tự a–z, 0–9, dấu chấm, gạch dưới', () => {
    expect(createTenantFormSchema.safeParse({ ...ok, username: 'ab' }).success).toBe(false)
    expect(createTenantFormSchema.safeParse({ ...ok, username: 'thue-101' }).success).toBe(false)
    expect(createTenantFormSchema.safeParse({ ...ok, username: 'thue.101_b' }).success).toBe(true)
  })

  it('bắt buộc chọn phòng, mật khẩu 8–72 ký tự và nhập lại khớp', () => {
    expect(createTenantFormSchema.safeParse({ ...ok, room_id: '' }).success).toBe(false)
    expect(
      createTenantFormSchema.safeParse({ ...ok, password: '1234567', confirmPassword: '1234567' })
        .success,
    ).toBe(false)
    const r = createTenantFormSchema.safeParse({ ...ok, confirmPassword: 'khac-1234' })
    expect(r.error?.issues[0]?.path).toEqual(['confirmPassword'])
  })

  it('đọc được response tạo người thuê của backend', () => {
    const parsed = createTenantResponseSchema.parse({
      message: 'Tạo tài khoản tenant thành công',
      user: {
        id: 1005,
        username: 'thue101b',
        display_name: 'Nguyễn Văn B',
        role: 'tenant',
        room_id: '101',
        room_name: '101',
      },
    })
    expect(parsed.user.room_name).toBe('101')
  })
})
