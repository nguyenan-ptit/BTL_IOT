import { z } from 'zod'

// Chủ trọ tạo tài khoản người thuê cho một phòng của mình: POST /api/accounts/tenants.
// Ràng buộc theo CreateTenantRequest trong backend/app/schemas/accounts.py.
export const createTenantFormSchema = z
  .object({
    room_id: z.string().min(1, 'Chọn phòng.'),
    username: z
      .string()
      .trim()
      .toLowerCase()
      .regex(
        /^[a-z0-9._]{3,32}$/,
        'Tên đăng nhập gồm 3–32 ký tự a–z, 0–9, dấu chấm hoặc gạch dưới.',
      ),
    display_name: z
      .string()
      .trim()
      .min(1, 'Nhập tên người thuê.')
      .max(100, 'Tên tối đa 100 ký tự.'),
    password: z.string().min(8, 'Mật khẩu ít nhất 8 ký tự.').max(72, 'Mật khẩu tối đa 72 ký tự.'),
    confirmPassword: z.string(),
  })
  .refine((v) => v.confirmPassword === v.password, {
    path: ['confirmPassword'],
    message: 'Mật khẩu nhập lại không khớp.',
  })
export type CreateTenantInput = z.input<typeof createTenantFormSchema>
export type CreateTenantForm = z.output<typeof createTenantFormSchema>

export const createTenantResponseSchema = z.looseObject({
  message: z.string(),
  user: z.looseObject({
    id: z.number(),
    username: z.string(),
    display_name: z.string(),
    role: z.literal('tenant'),
    room_id: z.string(),
    room_name: z.string(),
  }),
})
export type CreatedTenant = z.infer<typeof createTenantResponseSchema>['user']
