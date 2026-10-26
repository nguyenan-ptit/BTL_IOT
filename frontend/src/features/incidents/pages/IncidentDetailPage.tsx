import { ArrowLeft, CircleCheck, RefreshCw, Siren, Stamp as StampIcon } from 'lucide-react'
import { useState } from 'react'
import { Link, useParams } from 'react-router'
import { useCurrentUser } from '@/features/auth/hooks'
import { isApiError } from '@/shared/api/errors'
import { formatDateTime, formatRelative, formatTime } from '@/shared/lib/datetime'
import { useNow } from '@/shared/lib/useNow'
import { cn } from '@/shared/ui/cn'
import { DataState, EmptyState, Skeleton } from '@/shared/ui/DataState'
import { Sheet } from '@/shared/ui/Sheet'
import { AcknowledgeButton } from '../components/AcknowledgeButton'
import { IncidentStatusPill } from '../components/IncidentStatusPill'
import { Stamps } from '../components/Stamps'
import { measurementText, signsText } from '../format'
import { useIncident } from '../hooks'
import type { IncidentTimelineEntry } from '../schemas'

const timelineMeta = {
  detected: { icon: Siren, tone: 'text-alarm-deep bg-alarm-wash' },
  updated: { icon: RefreshCw, tone: 'text-ink-soft bg-ground' },
  acknowledged: { icon: StampIcon, tone: 'text-stamp bg-stamp-wash' },
  resolved: { icon: CircleCheck, tone: 'text-normal-ink bg-normal-wash' },
} as const

function timelineText(entry: IncidentTimelineEntry): string {
  switch (entry.kind) {
    case 'detected':
      return 'Phát hiện bất thường'
    case 'updated':
      return entry.count > 1
        ? `Bất thường tiếp diễn, ${entry.count} lần cập nhật số đo`
        : 'Bất thường tiếp diễn, cập nhật số đo'
    case 'acknowledged':
      return `${entry.actor?.displayName ?? 'Một người'} tiếp nhận`
    case 'resolved':
      return 'Số đo về bình thường ổn định, sự cố kết thúc'
  }
}

/** Chi tiết sự cố (US2, FR-016): tóm tắt, dấu tiếp nhận, dòng thời gian mới nhất ở trên. */
export default function IncidentDetailPage() {
  const { id = '' } = useParams()
  const incident = useIncident(id)
  const { data: me } = useCurrentUser()
  const now = useNow(1_000)
  const [fresh, setFresh] = useState(false)

  if (isApiError(incident.error, 'NOT_FOUND')) {
    return (
      <EmptyState title="Không tìm thấy sự cố">
        Sự cố không tồn tại hoặc không thuộc phòng bạn được xem.{' '}
        <Link to="/su-co" className="font-semibold text-board-900 underline">
          Về danh sách sự cố
        </Link>
      </EmptyState>
    )
  }

  return (
    <div className="flex flex-col gap-5">
      <Link
        to="/su-co"
        className="flex items-center gap-1 self-start text-sm font-semibold text-ink-soft hover:text-ink"
      >
        <ArrowLeft aria-hidden className="size-4" />
        Danh sách sự cố
      </Link>

      <DataState query={incident} skeleton={<Skeleton className="h-64" />} empty={null}>
        {(data) => (
          <div className="flex flex-col gap-5">
            <header className="flex flex-wrap items-center gap-3">
              <h1 className="text-2xl font-bold tracking-tight">
                Sự cố phòng <span className="tabular">{data.roomName}</span>
              </h1>
              <IncidentStatusPill status={data.status} />
            </header>
            <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
              <div className="flex flex-col gap-5">
                <Sheet
                  className={cn(
                    'flex flex-col gap-4 p-4 sm:p-5',
                    data.status !== 'resolved' && 'border-2 border-alarm',
                  )}
                >
                  <p className="text-lg font-bold">
                    Phát hiện {signsText(data.signs).toLowerCase()}
                  </p>
                  <dl className="grid gap-3 text-sm sm:grid-cols-2">
                    <div>
                      <dt className="font-semibold text-ink-soft">Bắt đầu</dt>
                      <dd className="tabular">
                        {formatDateTime(data.startedAt)} ({formatRelative(data.startedAt, now)})
                      </dd>
                    </div>
                    <div>
                      <dt className="font-semibold text-ink-soft">Kết thúc</dt>
                      <dd className="tabular">
                        {data.resolvedAt ? formatDateTime(data.resolvedAt) : 'Đang diễn ra'}
                      </dd>
                    </div>
                    <div>
                      <dt className="font-semibold text-ink-soft">Số đo lúc phát hiện</dt>
                      <dd className="tabular">{measurementText(data.firstMeasurement)}</dd>
                    </div>
                    <div>
                      <dt className="font-semibold text-ink-soft">Số đo mới nhất</dt>
                      <dd className="tabular">{measurementText(data.latestMeasurement)}</dd>
                    </div>
                  </dl>
                </Sheet>

                <section aria-labelledby="timeline-heading" className="flex flex-col gap-3">
                  <h2 id="timeline-heading" className="text-lg font-bold">
                    Dòng thời gian
                  </h2>
                  <ol className="flex flex-col">
                    {[...data.timeline].reverse().map((entry, i) => {
                      const meta = timelineMeta[entry.kind]
                      const Icon = meta.icon
                      return (
                        <li key={`${entry.at}-${i}`} className="flex gap-3">
                          <div className="flex flex-col items-center">
                            <span
                              className={cn(
                                'flex size-8 items-center justify-center rounded-full',
                                meta.tone,
                              )}
                            >
                              <Icon aria-hidden className="size-4" />
                            </span>
                            {i < data.timeline.length - 1 && (
                              <span aria-hidden className="w-px flex-1 bg-rule-strong" />
                            )}
                          </div>
                          <div className="flex flex-col gap-0.5 pb-5">
                            <p className="font-semibold">{timelineText(entry)}</p>
                            <p className="tabular text-sm text-ink-soft">
                              {formatTime(entry.at)}
                              {entry.measurement && ` · ${measurementText(entry.measurement)}`}
                            </p>
                          </div>
                        </li>
                      )
                    })}
                  </ol>
                </section>
              </div>

              <aside
                aria-labelledby="ack-heading"
                className="order-first flex flex-col gap-4 lg:order-none lg:sticky lg:top-20"
              >
                <Sheet className="flex flex-col gap-4 p-4 sm:p-5">
                  <h2 id="ack-heading" className="text-lg font-bold">
                    Tiếp nhận
                  </h2>
                  {data.acknowledgements.length > 0 ? (
                    <Stamps incident={data} freshUserId={fresh ? me?.id : null} />
                  ) : (
                    <p className="text-ink-soft">
                      {data.status === 'resolved'
                        ? 'Không ai tiếp nhận trước khi sự cố kết thúc.'
                        : 'Chưa ai tiếp nhận.'}
                    </p>
                  )}
                  {data.acknowledgedByMe && data.status !== 'resolved' && (
                    <p className="text-sm text-ink-soft">
                      Bạn đã tiếp nhận. Hệ thống ngừng nhắc lặp cho bạn và vẫn theo dõi đến khi số
                      đo về bình thường.
                    </p>
                  )}
                  <AcknowledgeButton
                    incident={data}
                    size="lg"
                    className="w-full"
                    onAcknowledged={() => setFresh(true)}
                  />
                </Sheet>
              </aside>
            </div>
          </div>
        )}
      </DataState>
    </div>
  )
}
