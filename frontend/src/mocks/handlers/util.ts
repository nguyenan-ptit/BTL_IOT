import { HttpResponse } from 'msw'
import { currentUser, type MockUser } from '../db'

export function apiError(
  status: number,
  code: string,
  message: string,
  fields?: Record<string, string>,
) {
  return HttpResponse.json({ code, message, ...(fields ? { fields } : {}) }, { status })
}

/** Trả người dùng đang đăng nhập, hoặc response 401/403 để handler trả về ngay. */
export function requireUser(permission?: 'admin'): MockUser | Response {
  const user = currentUser()
  if (!user) return apiError(401, 'UNAUTHENTICATED', 'Phiên đăng nhập đã hết hạn.')
  if (permission === 'admin' && user.role !== 'admin') {
    return apiError(403, 'FORBIDDEN', 'Bạn không có quyền thực hiện thao tác này.')
  }
  return user
}

export function paginate<T>(items: T[], url: URL) {
  const page = Math.max(1, Number(url.searchParams.get('page') ?? 1) || 1)
  const pageSize = Math.min(100, Math.max(1, Number(url.searchParams.get('pageSize') ?? 20) || 20))
  return {
    items: items.slice((page - 1) * pageSize, page * pageSize),
    total: items.length,
    page,
    pageSize,
  }
}
