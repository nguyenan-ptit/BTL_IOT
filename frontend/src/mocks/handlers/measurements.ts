import { http, HttpResponse } from 'msw'
import type { Measurement } from '@/features/history/schemas'
import { connectivityOf, db, nodeOfRoom, roomIdsInScope } from '../db'
import { apiError, requireUser } from './util'

const BUCKET_MS = { '1m': 60_000, '5m': 300_000, '1h': 3_600_000 } as const
/** Khoảng trống giữa hai số đo dài hơn mức này thì coi là mất kết nối. */
const GAP_MS = 90_000
const MAX_RANGE_MS = 31 * 24 * 3_600_000

function avg(values: (number | null)[], digits: number): number | null {
  const nums = values.filter((v): v is number => v !== null)
  if (nums.length === 0) return null
  const f = 10 ** digits
  return Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * f) / f
}

function aggregate(list: Measurement[], bucketMs: number): Measurement[] {
  const groups = new Map<number, Measurement[]>()
  for (const m of list) {
    const key = Math.floor(new Date(m.measuredAt).getTime() / bucketMs) * bucketMs
    const g = groups.get(key)
    if (g) g.push(m)
    else groups.set(key, [m])
  }
  return [...groups.entries()].map(([key, g]) => {
    const flames = g.map((m) => m.flame).filter((f): f is boolean => f !== null)
    return {
      measuredAt: new Date(key).toISOString(),
      receivedAt: g[g.length - 1]!.receivedAt,
      isBackfill: g.some((m) => m.isBackfill),
      gas: avg(
        g.map((m) => m.gas),
        0,
      ),
      temperature: avg(
        g.map((m) => m.temperature),
        1,
      ),
      flame: flames.length === 0 ? null : flames.some(Boolean),
    }
  })
}

export const measurementHandlers = [
  http.get('/api/rooms/:roomId/measurements', ({ params, request }) => {
    const user = requireUser()
    if (user instanceof Response) return user
    const roomId = String(params.roomId)
    if (!roomIdsInScope(user).has(roomId)) {
      return apiError(404, 'NOT_FOUND', 'Không tìm thấy phòng.')
    }
    const url = new URL(request.url)
    const from = url.searchParams.get('from')
    const to = url.searchParams.get('to')
    const bucket = (url.searchParams.get('bucket') ?? 'raw') as keyof typeof BUCKET_MS | 'raw'
    if (!from || !to || Number.isNaN(Date.parse(from)) || Number.isNaN(Date.parse(to))) {
      return apiError(422, 'VALIDATION_ERROR', 'Thiếu khoảng thời gian.')
    }
    const fromMs = Date.parse(from)
    const toMs = Date.parse(to)
    if (toMs < fromMs || toMs - fromMs > MAX_RANGE_MS) {
      return apiError(422, 'VALIDATION_ERROR', 'Khoảng thời gian tối đa 31 ngày.')
    }

    const inRange = (db.measurements.get(roomId) ?? []).filter((m) => {
      const t = Date.parse(m.measuredAt)
      return t >= fromMs && t <= toMs
    })

    const offlineRanges: { from: string; to: string }[] = []
    for (let i = 1; i < inRange.length; i++) {
      const prev = Date.parse(inRange[i - 1]!.measuredAt)
      const cur = Date.parse(inRange[i]!.measuredAt)
      if (cur - prev > GAP_MS) {
        offlineRanges.push({ from: inRange[i - 1]!.measuredAt, to: inRange[i]!.measuredAt })
      }
    }
    const node = nodeOfRoom(roomId)
    const last = inRange[inRange.length - 1]
    if (node && last && connectivityOf(node) === 'offline') {
      offlineRanges.push({
        from: last.measuredAt,
        to: new Date(Math.min(toMs, Date.now())).toISOString(),
      })
    }

    const incidents = db.incidents
      .filter((i) => i.roomId === roomId)
      .filter(
        (i) =>
          Date.parse(i.startedAt) <= toMs && (!i.resolvedAt || Date.parse(i.resolvedAt) >= fromMs),
      )
      .map((i) => ({ id: i.id, startedAt: i.startedAt, resolvedAt: i.resolvedAt }))

    return HttpResponse.json({
      measurements: bucket === 'raw' ? inRange : aggregate(inRange, BUCKET_MS[bucket]),
      incidents,
      offlineRanges,
    })
  }),
]
