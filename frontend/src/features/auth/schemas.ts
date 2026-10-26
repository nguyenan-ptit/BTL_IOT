import { z } from 'zod'
import { dateTimeSchema, roleSchema } from '@/shared/schemas/common'

export const permissionSchema = z.enum([
  'nodes:manage',
  'users:manage',
  'audit:read',
  'incidents:acknowledge',
])
export type Permission = z.infer<typeof permissionSchema>

export const userScopeSchema = z.object({
  boardingHouseIds: z.array(z.string()),
  roomIds: z.array(z.string()),
})
export type UserScope = z.infer<typeof userScopeSchema>

export const userSchema = z.object({
  id: z.string(),
  username: z.string(),
  displayName: z.string(),
  role: roleSchema,
  scope: userScopeSchema,
  locked: z.boolean(),
  createdAt: dateTimeSchema,
})
export type User = z.infer<typeof userSchema>

export const currentUserSchema = userSchema.extend({
  permissions: z.array(permissionSchema),
})
export type CurrentUser = z.infer<typeof currentUserSchema>

export const loginFormSchema = z.object({
  username: z
    .string()
    .trim()
    .min(1, 'Nhập tên đăng nhập.')
    .max(32, 'Tên đăng nhập tối đa 32 ký tự.'),
  password: z.string().min(1, 'Nhập mật khẩu.').max(72, 'Mật khẩu tối đa 72 ký tự.'),
})
export type LoginForm = z.infer<typeof loginFormSchema>
