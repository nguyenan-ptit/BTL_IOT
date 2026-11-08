import { parseAsString, parseAsStringLiteral, useQueryStates } from 'nuqs'
import type { HistoryRange } from './api'

export const RANGE_OPTIONS = ['gan-nhat', 'tuy-chon'] as const
export type RangeOption = (typeof RANGE_OPTIONS)[number]

// ?phong=101, hoặc ?phong=101&khoang=tuy-chon&tu=2026-11-07&den=2026-11-08
export function useHistoryFilters() {
  return useQueryStates(
    {
      phong: parseAsString,
      khoang: parseAsStringLiteral(RANGE_OPTIONS).withDefault('gan-nhat'),
      tu: parseAsString,
      den: parseAsString,
    },
    { history: 'replace' },
  )
}

/** Ngày yyyy-mm-dd theo giờ Việt Nam → khoảng ISO; trả null khi chưa chọn đủ hoặc sai thứ tự. */
export function customRange(tu: string | null, den: string | null): HistoryRange {
  if (!tu || !den) return null
  const from = new Date(`${tu}T00:00:00+07:00`)
  const to = new Date(`${den}T23:59:59+07:00`)
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || to < from) return null
  return { from: from.toISOString(), to: to.toISOString() }
}
