import { http, HttpResponse } from 'msw'
import { db, permissionsFor, session, toPublicUser } from '../db'
import { apiError, requireUser } from './util'

export const authHandlers = [
  http.post('/api/auth/login', async ({ request }) => {
    const body = (await request.json().catch(() => null)) as {
      username?: string
      password?: string
    } | null
    const user = db.users.find((u) => u.username === body?.username?.trim())
    if (!user || user.password !== body?.password) {
      return apiError(401, 'INVALID_CREDENTIALS', 'Tên đăng nhập hoặc mật khẩu không đúng.')
    }
    if (user.locked) return apiError(403, 'ACCOUNT_LOCKED', 'Tài khoản đã bị khóa.')
    session.set(user.id)
    return HttpResponse.json({ ...toPublicUser(user), permissions: permissionsFor(user.role) })
  }),

  http.post('/api/auth/logout', () => {
    session.set(null)
    return new HttpResponse(null, { status: 204 })
  }),

  http.get('/api/auth/me', () => {
    const user = requireUser()
    if (user instanceof Response) return user
    return HttpResponse.json({ ...toPublicUser(user), permissions: permissionsFor(user.role) })
  }),
]
