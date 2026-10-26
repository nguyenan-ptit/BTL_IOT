import { ChevronRight, Siren } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'
import { useCurrentUser } from '@/features/auth/hooks'
import { formatRelative, formatTime } from '@/shared/lib/datetime'
import { measurementText, signsText } from '../format'
import type { Incident } from '../schemas'
import { AcknowledgeButton } from './AcknowledgeButton'
import { Stamps } from './Stamps'

/**
 * Tờ thông báo sự cố ghim lên thẻ phòng: điểm nhấn của hướng "bảng tin nhà trọ".
 * Đây là thứ duy nhất trên trang được nổi lên (có bóng), theo direction contract.
 */
export function IncidentNotice({ incident, now }: { incident: Incident; now: Date }) {
  const { data: me } = useCurrentUser()
  const [fresh, setFresh] = useState(false)

  return (
    <section
      aria-label={`Sự cố phòng ${incident.roomName}`}
      className="relative -mx-0.5 -mt-0.5 rounded-t-[var(--radius-sheet)] bg-alarm px-4 pt-5 pb-4 text-white shadow-[var(--shadow-pinned)]"
    >
      {/* Đinh ghim tờ thông báo lên bảng. */}
      <span
        aria-hidden
        className="absolute top-1.5 left-1/2 size-2.5 -translate-x-1/2 rounded-full bg-white/90 ring-2 ring-alarm-deep"
      />
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <p className="flex items-start gap-2 text-lg leading-snug font-bold">
            <Siren aria-hidden className="mt-1 size-5 shrink-0" />
            Phát hiện {signsText(incident.signs).toLowerCase()}
          </p>
          <p className="tabular text-sm text-white/90">
            Từ {formatTime(incident.startedAt)} ({formatRelative(incident.startedAt, now)}) · Mới
            nhất: {measurementText(incident.latestMeasurement)}
          </p>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-end justify-between gap-3">
        {incident.acknowledgements.length > 0 ? (
          <Stamps
            incident={incident}
            freshUserId={fresh ? me?.id : null}
            className="[&_div]:bg-sheet [&_div]:shadow-sm"
          />
        ) : (
          <p className="text-sm font-semibold">Chưa ai tiếp nhận</p>
        )}
        <div className="flex items-center gap-2">
          <Link
            to={`/su-co/${incident.id}`}
            className="flex h-10 items-center gap-0.5 rounded-[var(--radius-sheet)] px-2 text-sm font-semibold text-white underline-offset-4 hover:underline"
          >
            Chi tiết
            <ChevronRight aria-hidden className="size-4" />
          </Link>
          <AcknowledgeButton
            incident={incident}
            variant="stampOnAlarm"
            onAcknowledged={() => setFresh(true)}
          />
        </div>
      </div>
    </section>
  )
}
