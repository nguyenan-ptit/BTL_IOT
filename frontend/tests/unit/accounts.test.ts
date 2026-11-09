import { describe, expect, it } from 'vitest'
import {
  createUserFormSchema,
  editUserFormSchema,
  landlordWithoutHouse,
} from '@/features/accounts/schemas'

const landlord = {
  username: 'chutro2',
  displayName: 'Chủ trọ 2',
  password: 'matkhau-123',
  role: 'landlord' as const,
  boardingHouseIds: [] as string[],
  roomIds: [] as string[],
}

describe('tạo chủ trọ chưa có nhà trọ', () => {
  it('khi tạo cho phép chủ trọ chưa có nhà trọ', () => {
    expect(createUserFormSchema.safeParse(landlord).success).toBe(true)
  })

  it('khi sửa vẫn bắt chủ trọ có ít nhất một nhà trọ (backend yêu cầu)', () => {
    expect(editUserFormSchema.safeParse(landlord).success).toBe(false)
  })

  it('người thuê vẫn phải có ít nhất một phòng', () => {
    expect(createUserFormSchema.safeParse({ ...landlord, role: 'tenant' }).success).toBe(false)
  })

  it('chọn đúng API: chủ trọ không có nhà dùng /api/accounts/landlords', () => {
    expect(landlordWithoutHouse(landlord)).toBe(true)
    expect(landlordWithoutHouse({ ...landlord, boardingHouseIds: ['1'] })).toBe(false)
    expect(landlordWithoutHouse({ ...landlord, role: 'admin' })).toBe(false)
  })
})
