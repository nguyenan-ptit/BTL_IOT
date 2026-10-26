import { z } from 'zod'
import { request } from '@/shared/api/http'
import { currentUserSchema, type LoginForm } from './schemas'

export const authKeys = {
  me: ['auth', 'me'] as const,
}

export function fetchMe(signal?: AbortSignal) {
  return request('/api/auth/me', currentUserSchema, { signal })
}

export function login(form: LoginForm) {
  return request('/api/auth/login', currentUserSchema, { method: 'POST', body: form })
}

export function logout() {
  return request('/api/auth/logout', z.null(), { method: 'POST' })
}
