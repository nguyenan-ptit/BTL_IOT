import { request } from '@/shared/api/http'
import { measurementHistorySchema, type Bucket } from './schemas'

export const historyKeys = {
  all: ['history'] as const,
  room: (roomId: string, range: HistoryRange) => ['history', roomId, range] as const,
}

export type RangePreset = '1h' | '24h' | '7d'
export type HistoryRange = { preset: RangePreset } | { from: string; to: string }

const HOUR = 3_600_000
const PRESET_MS: Record<RangePreset, number> = { '1h': HOUR, '24h': 24 * HOUR, '7d': 7 * 24 * HOUR }

/** Tự chọn độ gộp theo độ dài khoảng (research R8): 1 giờ → raw, 24 giờ → 5m, 7 ngày → 1h. */
export function bucketFor(spanMs: number): Bucket {
  if (spanMs <= 2 * HOUR) return 'raw'
  if (spanMs <= 2 * 24 * HOUR) return '5m'
  return '1h'
}

export function resolveRange(range: HistoryRange, now = Date.now()) {
  if ('preset' in range) {
    return {
      from: new Date(now - PRESET_MS[range.preset]).toISOString(),
      to: new Date(now).toISOString(),
    }
  }
  return range
}

export function fetchHistory(roomId: string, range: HistoryRange, signal?: AbortSignal) {
  const { from, to } = resolveRange(range)
  const bucket = bucketFor(Date.parse(to) - Date.parse(from))
  return request(
    `/api/rooms/${encodeURIComponent(roomId)}/measurements`,
    measurementHistorySchema,
    { query: { from, to, bucket }, signal },
  )
}
