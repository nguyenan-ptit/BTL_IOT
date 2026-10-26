import { http, HttpResponse } from 'msw'
import { db } from '../db'
import { paginate, requireUser } from './util'

// Các handler khác ghi nhật ký qua audit() trong db.ts; ở đây chỉ đọc và lọc.
export const auditHandlers = [
  http.get('/api/audit-logs', ({ request }) => {
    const user = requireUser('admin')
    if (user instanceof Response) return user
    const url = new URL(request.url)
    const actions = url.searchParams.getAll('action')
    const from = url.searchParams.get('from')
    const to = url.searchParams.get('to')
    const items = db.auditLog
      .filter((e) => actions.length === 0 || actions.includes(e.action))
      .filter((e) => !from || e.at >= from)
      .filter((e) => !to || e.at <= to)
      .sort((a, b) => b.at.localeCompare(a.at))
    return HttpResponse.json(paginate(items, url))
  }),
]
