import { z } from 'zod'
import { request } from '@/shared/api/http'
import { clearToken, setToken } from '@/shared/api/token'
import { currentUserSchema, loginResponseSchema, type CurrentUser, type LoginForm } from './schemas'

export const authKeys = {
  me: ['auth', 'me'] as const,
}

export function fetchMe(signal?: AbortSignal) {
  return request('/api/auth/me', currentUserSchema, { signal })
}

/** Đăng nhập, lưu token Bearer để các request sau tự gắn vào header. */
export async function login(form: LoginForm): Promise<CurrentUser> {
  const result = await request('/api/auth/login', loginResponseSchema, {
    method: 'POST',
    body: form,
  })
  setToken(result.accessToken)
  return result.user
}

/** Token không có trạng thái phía máy chủ, nên luôn xoá token kể cả khi API lỗi. */
export async function logout(): Promise<void> {
  try {
    await request('/api/auth/logout', z.null(), { method: 'POST' })
  } finally {
    clearToken()
  }
}

export function changePassword(body: { currentPassword: string; newPassword: string }) {
  return request('/api/auth/change-password', z.null(), { method: 'POST', body })
}
