import { z } from 'zod'
import { userSchema, type UserScope } from '@/features/auth/schemas'
import { request } from '@/shared/api/http'
import { pageSchema, type Role } from '@/shared/schemas/common'

export type UserFilters = {
  q: string | null
  role: Role | null
  locked: boolean | null
  page: number
}

export const accountKeys = {
  all: ['users'] as const,
  list: (f: UserFilters) => ['users', 'list', f] as const,
}

export const USER_PAGE_SIZE = 20

export function fetchUsers(f: UserFilters, signal?: AbortSignal) {
  return request('/api/users', pageSchema(userSchema), {
    query: { q: f.q, role: f.role, locked: f.locked, page: f.page, pageSize: USER_PAGE_SIZE },
    signal,
  })
}

export function createUser(body: {
  username: string
  displayName: string
  password: string
  role: Role
  scope: UserScope
}) {
  return request('/api/users', userSchema, { method: 'POST', body })
}

/** Tạo chủ trọ chưa có nhà trọ (chỉ admin). Response khác /api/users nên chỉ kiểm tra tối thiểu. */
export function createLandlordWithoutHouse(body: {
  username: string
  displayName: string
  password: string
}) {
  return request(
    '/api/accounts/landlords',
    z.looseObject({ user: z.looseObject({ id: z.number(), username: z.string() }) }),
    {
      method: 'POST',
      body: {
        username: body.username,
        password: body.password,
        display_name: body.displayName,
        boarding_house_ids: [],
      },
    },
  )
}

export function updateUser(
  id: string,
  body: { displayName: string; role: Role; scope: UserScope },
) {
  return request(`/api/users/${encodeURIComponent(id)}`, userSchema, { method: 'PATCH', body })
}

export function setLocked(id: string, locked: boolean) {
  return request(`/api/users/${encodeURIComponent(id)}/${locked ? 'lock' : 'unlock'}`, userSchema, {
    method: 'POST',
  })
}
