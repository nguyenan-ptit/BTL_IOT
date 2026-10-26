import type { RoomOverall } from '@/shared/schemas/common'
import { cn } from './cn'
import { roomStatusStyle } from './status'

export function StatusPill({ status, className }: { status: RoomOverall; className?: string }) {
  const style = roomStatusStyle[status]
  const Icon = style.icon
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-sm leading-none font-semibold',
        style.pill,
        className,
      )}
    >
      <Icon aria-hidden className="size-4 shrink-0" strokeWidth={2.25} />
      {style.label}
    </span>
  )
}
