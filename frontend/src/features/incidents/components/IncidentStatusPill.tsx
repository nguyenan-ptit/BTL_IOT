import { CircleCheck, Siren, Stamp } from 'lucide-react'
import { incidentStatusLabel } from '@/shared/lib/labels'
import type { IncidentStatus } from '@/shared/schemas/common'
import { cn } from '@/shared/ui/cn'

const styles: Record<IncidentStatus, { icon: typeof Siren; className: string }> = {
  open: { icon: Siren, className: 'bg-alarm text-white' },
  // Tím mực dấu: chỉ dùng cho tiếp nhận.
  acknowledged: {
    icon: Stamp,
    className: 'bg-stamp-wash text-stamp ring-1 ring-inset ring-stamp/40',
  },
  resolved: {
    icon: CircleCheck,
    className: 'bg-ground text-ink-soft ring-1 ring-inset ring-rule-strong',
  },
}

export function IncidentStatusPill({ status }: { status: IncidentStatus }) {
  const { icon: Icon, className } = styles[status]
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-sm leading-none font-semibold whitespace-nowrap',
        className,
      )}
    >
      <Icon aria-hidden className="size-4 shrink-0" strokeWidth={2.25} />
      {incidentStatusLabel[status]}
    </span>
  )
}
