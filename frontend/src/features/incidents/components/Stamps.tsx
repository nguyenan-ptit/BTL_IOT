import { Stamp } from '@/shared/ui/Stamp'
import { cn } from '@/shared/ui/cn'
import type { Incident } from '../schemas'

const TILTS = [-4, 3, -2, 5, -6]

/** Các dấu tiếp nhận, mỗi người một dấu, xếp chồng lệch nhau như đóng tay nhiều lần. */
export function Stamps({
  incident,
  freshUserId,
  className,
}: {
  incident: Incident
  freshUserId?: string | null
  className?: string
}) {
  if (incident.acknowledgements.length === 0) return null
  return (
    <ul aria-label="Người đã tiếp nhận" className={cn('flex flex-wrap gap-x-1 gap-y-2', className)}>
      {incident.acknowledgements.map((ack, i) => (
        <li key={ack.user.id} className={i > 0 ? '-ml-3' : undefined}>
          <Stamp
            name={ack.user.displayName}
            at={ack.at}
            tilt={TILTS[i % TILTS.length]}
            fresh={ack.user.id === freshUserId}
          />
        </li>
      ))}
    </ul>
  )
}
