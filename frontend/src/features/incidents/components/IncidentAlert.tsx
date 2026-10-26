import { ChevronRight, Siren } from 'lucide-react'
import { Link, useLocation } from 'react-router'
import { useActiveIncidents } from '../hooks'
import { signsText } from '../format'

/**
 * Dải báo sự cố chưa tiếp nhận, hiện trên mọi trang (FR-018). Ẩn trên trang tổng quan vì ở đó
 * tờ thông báo đã ghim lên thẻ phòng, và ẩn trên chính trang chi tiết của sự cố đó.
 */
export function IncidentAlert() {
  const { data } = useActiveIncidents()
  const location = useLocation()
  const pending = (data ?? []).filter((i) => i.status === 'open' && !i.acknowledgedByMe)
  const visible = pending.filter((i) => location.pathname !== `/su-co/${i.id}`)
  if (location.pathname === '/' || visible.length === 0) return null

  const first = visible[0]!
  const more = visible.length - 1

  return (
    <div role="alert" className="bg-alarm text-white">
      <Link
        to={`/su-co/${first.id}`}
        className="mx-auto flex max-w-7xl items-center gap-2 px-4 py-2.5 text-sm font-semibold md:px-6"
      >
        <Siren aria-hidden className="size-5 shrink-0" />
        <span className="flex-1">
          Phòng {first.roomName}: phát hiện {signsText(first.signs).toLowerCase()}, chưa tiếp nhận
          {more > 0 && ` · và ${more} sự cố khác`}
        </span>
        <span className="flex shrink-0 items-center underline-offset-4 hover:underline">
          Xem
          <ChevronRight aria-hidden className="size-4" />
        </span>
      </Link>
    </div>
  )
}
