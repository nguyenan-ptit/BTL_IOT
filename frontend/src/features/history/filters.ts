import { parseAsString, parseAsStringLiteral, useQueryStates } from 'nuqs'
import type { HistoryRange } from './api'

export const RANGE_OPTIONS = ['1h', '24h', '7d', 'tuy-chon'] as const
export type RangeOption = (typeof RANGE_OPTIONS)[number]

// ?phong=r101&khoang=24h, hoặc ?phong=r101&khoang=tuy-chon&tu=2026-10-20&den=2026-10-25 (research R5)
export function useHistoryFilters() {
  return useQueryStates(
    {
      phong: parseAsString,
      khoang: parseAsStringLiteral(RANGE_OPTIONS).withDefault('24h'),
      tu: parseAsString,
      den: parseAsString,
    },
    { history: 'replace' },
  )
}

/** Ngày yyyy-mm-dd theo giờ Việt Nam → khoảng ISO; trả null khi chưa chọn đủ hoặc sai thứ tự. */
export function customRange(tu: string | null, den: string | null): HistoryRange | null {
  if (!tu || !den) return null
  const from = new Date(`${tu}T00:00:00+07:00`)
  const to = new Date(`${den}T23:59:59.999+07:00`)
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || to < from) return null
  return { from: from.toISOString(), to: to.toISOString() }
}
