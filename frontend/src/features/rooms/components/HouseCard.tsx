import { Building2, ChevronRight } from 'lucide-react'
import { roomOverallLabel } from '@/shared/lib/labels'
import type { RoomOverall } from '@/shared/schemas/common'
import { cn } from '@/shared/ui/cn'
import { roomStatusStyle } from '@/shared/ui/status'
import { StatusPill } from '@/shared/ui/StatusPill'
import { countByOverall, worstOverall } from '../overall'

/** Thẻ một nhà trọ ở tổng quan của chủ trọ: trạng thái nặng nhất và số phòng theo trạng thái. */
export function HouseCard({
  name,
  overalls,
  onOpen,
}: {
  name: string
  overalls: RoomOverall[]
  onOpen: () => void
}) {
  const worst = worstOverall(overalls)
  const counts = countByOverall(overalls)
  const urgent = worst === 'alarm'

  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn(
        'group flex h-full w-full flex-col gap-3 rounded-[var(--radius-sheet)] border-2 bg-sheet p-4 text-left hover:border-board-200 focus-visible:outline-2 focus-visible:outline-board-800',
        urgent ? 'border-alarm bg-alarm-wash' : 'border-rule',
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-2.5">
          <Building2 aria-hidden className="mt-0.5 size-5 shrink-0 text-ink-soft" />
          <div className="min-w-0">
            <h2 className="truncate text-lg font-bold">{name}</h2>
            <p className="text-sm text-ink-soft">{overalls.length} phòng</p>
          </div>
        </div>
        {overalls.length > 0 && (
          <StatusPill status={worst} className="shrink-0 whitespace-nowrap" />
        )}
      </div>
      <ul className="flex flex-wrap gap-x-3 gap-y-1 text-sm">
        {counts.map(([overall, n]) => (
          <li key={overall} className="flex items-center gap-1.5">
            <span aria-hidden className={cn('size-2 rounded-full', roomStatusStyle[overall].dot)} />
            <span className="tabular font-semibold">{n}</span>
            <span className="text-ink-soft">{roomOverallLabel[overall].toLowerCase()}</span>
          </li>
        ))}
        {counts.length === 0 && <li className="text-ink-soft">Chưa có phòng</li>}
      </ul>
      <span className="mt-auto flex items-center gap-1 text-sm font-semibold text-board-900">
        Xem các phòng
        <ChevronRight
          aria-hidden
          className="size-4 transition-transform group-hover:translate-x-0.5"
        />
      </span>
    </button>
  )
}
