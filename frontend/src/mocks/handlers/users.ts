import { http, HttpResponse } from 'msw'
import { roleLabel } from '@/shared/lib/labels'
import type { Role } from '@/shared/schemas/common'
import { audit, db, nextId, toPublicUser, type MockUser } from '../db'
import { apiError, paginate, requireUser } from './util'

type Body = {
  username?: string
  displayName?: string
  password?: string
  role?: Role
  scope?: { boardingHouseIds?: string[]; roomIds?: string[] }
}

function activeAdmins() {
  return db.users.filter((u) => u.role === 'admin' && !u.locked)
}

export const userHandlers = [
  http.get('/api/users', ({ request }) => {
    const user = requireUser('admin')
    if (user instanceof Response) return user
    const url = new URL(request.url)
    const role = url.searchParams.get('role')
    const locked = url.searchParams.get('locked')
    const q = url.searchParams.get('q')?.trim().toLowerCase()
    const items = db.users
      .filter((u) => !role || u.role === role)
      .filter((u) => locked === null || String(u.locked) === locked)
      .filter((u) => !q || u.username.includes(q) || u.displayName.toLowerCase().includes(q))
      .sort((a, b) => a.username.localeCompare(b.username))
      .map(toPublicUser)
    return HttpResponse.json(paginate(items, url))
  }),

  http.post('/api/users', async ({ request }) => {
    const actor = requireUser('admin')
    if (actor instanceof Response) return actor
    const body = ((await request.json().catch(() => null)) ?? {}) as Body
    const username = body.username?.trim().toLowerCase() ?? ''
    if (db.users.some((u) => u.username === username)) {
      return apiError(409, 'USERNAME_TAKEN', 'Tên đăng nhập đã có người dùng.')
    }
    const user: MockUser = {
      id: nextId('u'),
      username,
      displayName: body.displayName?.trim() ?? username,
      role: body.role ?? 'tenant',
      scope: {
        boardingHouseIds: body.scope?.boardingHouseIds ?? [],
        roomIds: body.scope?.roomIds ?? [],
      },
      locked: false,
      createdAt: new Date().toISOString(),
      password: body.password ?? '',
    }
    db.users.push(user)
    audit(
      actor,
      'user_created',
      { type: 'user', id: user.id, label: user.username },
      `Tạo tài khoản ${user.username} (${roleLabel[user.role]})`,
    )
    return HttpResponse.json(toPublicUser(user), { status: 201 })
  }),

  http.patch('/api/users/:id', async ({ params, request }) => {
    const actor = requireUser('admin')
    if (actor instanceof Response) return actor
    const user = db.users.find((u) => u.id === params.id)
    if (!user) return apiError(404, 'NOT_FOUND', 'Không tìm thấy tài khoản.')
    const body = ((await request.json().catch(() => null)) ?? {}) as Body
    if (body.role && body.role !== 'admin' && user.role === 'admin' && activeAdmins().length <= 1) {
      return apiError(409, 'LAST_ADMIN', 'Phải còn ít nhất một quản trị viên.')
    }
    if (body.displayName) user.displayName = body.displayName.trim()
    if (body.role) user.role = body.role
    if (body.scope) {
      user.scope = {
        boardingHouseIds: body.scope.boardingHouseIds ?? [],
        roomIds: body.scope.roomIds ?? [],
      }
    }
    audit(
      actor,
      'user_updated',
      { type: 'user', id: user.id, label: user.username },
      `Sửa tài khoản ${user.username}: ${roleLabel[user.role]}`,
    )
    return HttpResponse.json(toPublicUser(user))
  }),

  http.post('/api/users/:id/lock', ({ params }) => {
    const actor = requireUser('admin')
    if (actor instanceof Response) return actor
    const user = db.users.find((u) => u.id === params.id)
    if (!user) return apiError(404, 'NOT_FOUND', 'Không tìm thấy tài khoản.')
    if (user.id === actor.id)
      return apiError(409, 'CANNOT_LOCK_SELF', 'Không thể tự khóa tài khoản của mình.')
    if (user.role === 'admin' && activeAdmins().length <= 1) {
      return apiError(409, 'LAST_ADMIN', 'Phải còn ít nhất một quản trị viên.')
    }
    user.locked = true
    audit(
      actor,
      'user_locked',
      { type: 'user', id: user.id, label: user.username },
      `Khóa tài khoản ${user.username}`,
    )
    return HttpResponse.json(toPublicUser(user))
  }),

  http.post('/api/users/:id/unlock', ({ params }) => {
    const actor = requireUser('admin')
    if (actor instanceof Response) return actor
    const user = db.users.find((u) => u.id === params.id)
    if (!user) return apiError(404, 'NOT_FOUND', 'Không tìm thấy tài khoản.')
    user.locked = false
    audit(
      actor,
      'user_unlocked',
      { type: 'user', id: user.id, label: user.username },
      `Mở khóa tài khoản ${user.username}`,
    )
    return HttpResponse.json(toPublicUser(user))
  }),
]
