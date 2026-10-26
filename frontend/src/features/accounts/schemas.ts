import { z } from 'zod'
import { roleSchema } from '@/shared/schemas/common'

// Form tạo/sửa tài khoản (FR-029, FR-030). Ràng buộc độ dài theo data-model.md.
const base = z.object({
  displayName: z
    .string()
    .trim()
    .min(1, 'Nhập tên hiển thị.')
    .max(255, 'Tên hiển thị tối đa 255 ký tự.'),
  role: roleSchema,
  boardingHouseIds: z.array(z.string()),
  roomIds: z.array(z.string()),
})

/** Chủ trọ phải có ít nhất một nhà trọ, người thuê ít nhất một phòng. */
function scopeRule<T extends z.infer<typeof base>>(v: T, ctx: z.RefinementCtx) {
  if (v.role === 'landlord' && v.boardingHouseIds.length === 0) {
    ctx.addIssue({
      code: 'custom',
      path: ['boardingHouseIds'],
      message: 'Chọn ít nhất một nhà trọ.',
    })
  }
  if (v.role === 'tenant' && v.roomIds.length === 0) {
    ctx.addIssue({ code: 'custom', path: ['roomIds'], message: 'Chọn ít nhất một phòng.' })
  }
}

export const createUserFormSchema = base
  .extend({
    username: z
      .string()
      .trim()
      .toLowerCase()
      .regex(
        /^[a-z0-9._]{3,32}$/,
        'Tên đăng nhập gồm 3–32 ký tự a–z, 0–9, dấu chấm hoặc gạch dưới.',
      ),
    password: z.string().min(8, 'Mật khẩu ít nhất 8 ký tự.').max(72, 'Mật khẩu tối đa 72 ký tự.'),
  })
  .superRefine(scopeRule)
export type CreateUserForm = z.infer<typeof createUserFormSchema>

export const editUserFormSchema = base.superRefine(scopeRule)
export type EditUserForm = z.infer<typeof editUserFormSchema>

/** Body gửi lên API: chỉ giữ phạm vi đúng với vai trò. */
export function toScope(form: { role: string; boardingHouseIds: string[]; roomIds: string[] }) {
  return {
    boardingHouseIds: form.role === 'landlord' ? form.boardingHouseIds : [],
    roomIds: form.role === 'tenant' ? form.roomIds : [],
  }
}
