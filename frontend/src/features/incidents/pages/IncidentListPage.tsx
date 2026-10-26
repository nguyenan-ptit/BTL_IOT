import { ChevronLeft, ChevronRight, X } from 'lucide-react'
import { Link } from 'react-router'
import { useRooms } from '@/features/rooms/hooks'
import { formatDateTime, formatTime } from '@/shared/lib/datetime'
import { incidentStatusLabel } from '@/shared/lib/labels'
import { incidentStatusSchema, type IncidentStatus } from '@/shared/schemas/common'
import { Button } from '@/shared/ui/Button'
import { cn } from '@/shared/ui/cn'
import { DataState, EmptyState, Skeleton } from '@/shared/ui/DataState'
import { inputClass } from '@/shared/ui/Field'
import { INCIDENT_PAGE_SIZE } from '../api'
import { IncidentStatusPill } from '../components/IncidentStatusPill'
import { useIncidentFilters } from '../filters'
import { signsText } from '../format'
import { useIncidents } from '../hooks'
import type { Incident } from '../schemas'

/** Ngày trên ô lọc (yyyy-mm-dd, giờ Việt Nam) đổi sang mốc ISO đầu hoặc cuối ngày. */
function dayBound(day: string | null, end: boolean): string | null {
  if (!day) return null
  return new Date(`${day}T${end ? '23:59:59.999' : '00:00:00'}+07:00`).toISOString()
}

function Acknowledgers({ incident }: { incident: Incident }) {
  if (incident.acknowledgements.length === 0) {
    return <span className="text-ink-faint">Chưa ai</span>
  }
  return (
    <span className="text-stamp">
      {incident.acknowledgements
        .map((a) => `${a.user.displayName} (${formatTime(a.at)})`)
        .join(', ')}
    </span>
  )
}

/** Danh sách sự cố (US2): chưa tiếp nhận nổi bật trên cùng, lọc theo phòng, tình trạng, ngày. */
export default function IncidentListPage() {
  const [filters, setFilters] = useIncidentFilters()
  const rooms = useRooms()
  const incidents = useIncidents({
    roomId: filters.phong,
    status: filters['tinh-trang'],
    from: dayBound(filters.tu, false),
    to: dayBound(filters.den, true),
    page: filters.trang,
  })
  const hasFilter = !!(filters.phong || filters['tinh-trang'].length || filters.tu || filters.den)

  const toggleStatus = (status: IncidentStatus) => {
    const current = filters['tinh-trang']
    void setFilters({
      'tinh-trang': current.includes(status)
        ? current.filter((s) => s !== status)
        : [...current, status],
      trang: 1,
    })
  }

  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-2xl font-bold tracking-tight">Sự cố</h1>

      <section
        aria-label="Bộ lọc"
        className="flex flex-col gap-3 rounded-[var(--radius-sheet)] border border-rule bg-sheet p-4 lg:flex-row lg:flex-wrap lg:items-end"
      >
        <div className="flex flex-col gap-1.5">
          <label htmlFor="filter-room" className="text-sm font-semibold">
            Phòng
          </label>
          <select
            id="filter-room"
            className={cn(inputClass, 'lg:w-40')}
            value={filters.phong ?? ''}
            onChange={(e) => void setFilters({ phong: e.target.value || null, trang: 1 })}
          >
            <option value="">Tất cả phòng</option>
            {rooms.data?.map((room) => (
              <option key={room.id} value={room.id}>
                Phòng {room.name}
              </option>
            ))}
          </select>
        </div>

        <fieldset className="flex flex-col gap-1.5">
          <legend className="mb-1.5 text-sm font-semibold">Tình trạng</legend>
          <div className="flex flex-wrap gap-2">
            {incidentStatusSchema.options.map((status) => {
              const on = filters['tinh-trang'].includes(status)
              return (
                <button
                  key={status}
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggleStatus(status)}
                  className={cn(
                    'h-11 rounded-full px-4 text-sm font-semibold ring-1 ring-inset',
                    on
                      ? 'bg-board-900 text-white ring-board-900'
                      : 'bg-sheet text-ink ring-rule-strong hover:bg-board-100',
                  )}
                >
                  {incidentStatusLabel[status]}
                </button>
              )
            })}
          </div>
        </fieldset>

        <div className="grid grid-cols-2 gap-3 lg:flex">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="filter-from" className="text-sm font-semibold">
              Từ ngày
            </label>
            <input
              id="filter-from"
              type="date"
              className={cn(inputClass, 'lg:w-44')}
              value={filters.tu ?? ''}
              max={filters.den ?? undefined}
              onChange={(e) => void setFilters({ tu: e.target.value || null, trang: 1 })}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="filter-to" className="text-sm font-semibold">
              Đến ngày
            </label>
            <input
              id="filter-to"
              type="date"
              className={cn(inputClass, 'lg:w-44')}
              value={filters.den ?? ''}
              min={filters.tu ?? undefined}
              onChange={(e) => void setFilters({ den: e.target.value || null, trang: 1 })}
            />
          </div>
        </div>

        {hasFilter && (
          <Button
            variant="ghost"
            className="self-start lg:ml-auto lg:self-end"
            onClick={() =>
              void setFilters({ phong: null, 'tinh-trang': [], tu: null, den: null, trang: 1 })
            }
          >
            <X aria-hidden className="size-4" />
            Bỏ lọc
          </Button>
        )}
      </section>

      <DataState
        query={incidents}
        isEmpty={(data) => data.items.length === 0}
        skeleton={
          <div className="flex flex-col gap-2">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-16" />
            ))}
          </div>
        }
        empty={
          <EmptyState title={hasFilter ? 'Không có sự cố nào khớp bộ lọc' : 'Chưa có sự cố nào'}>
            {hasFilter
              ? 'Thử bỏ bớt điều kiện lọc.'
              : 'Khi một phòng phát hiện bất thường, sự cố sẽ hiện ở đây.'}
          </EmptyState>
        }
      >
        {(page) => (
          <div className="flex flex-col gap-3">
            <ul className="flex flex-col gap-2">
              {page.items.map((incident) => (
                <li key={incident.id}>
                  <Link
                    to={`/su-co/${incident.id}`}
                    className={cn(
                      'grid grid-cols-[1fr_auto] gap-x-4 gap-y-1.5 rounded-[var(--radius-sheet)] border bg-sheet p-4 hover:border-board-800 md:grid-cols-[7rem_10rem_1fr_auto] md:items-center',
                      incident.status === 'open' ? 'border-alarm border-2' : 'border-rule',
                    )}
                  >
                    <span className="tabular text-lg font-bold md:order-1">
                      Phòng {incident.roomName}
                    </span>
                    <span className="justify-self-end md:order-4">
                      <IncidentStatusPill status={incident.status} />
                    </span>
                    <span className="col-span-2 font-semibold md:order-3 md:col-span-1">
                      {signsText(incident.signs)}
                      <span className="block text-sm font-normal">
                        <Acknowledgers incident={incident} />
                      </span>
                    </span>
                    <span className="tabular col-span-2 text-sm text-ink-soft md:order-2 md:col-span-1">
                      {formatDateTime(incident.startedAt)}
                      {incident.resolvedAt && (
                        <span className="block">Kết thúc {formatTime(incident.resolvedAt)}</span>
                      )}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>

            {page.total > INCIDENT_PAGE_SIZE && (
              <nav aria-label="Phân trang" className="flex items-center justify-between gap-3">
                <p className="text-sm text-ink-soft">
                  Trang {page.page} / {Math.ceil(page.total / page.pageSize)} · {page.total} sự cố
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={page.page <= 1}
                    onClick={() => void setFilters({ trang: page.page - 1 })}
                  >
                    <ChevronLeft aria-hidden className="size-4" />
                    Trước
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={page.page * page.pageSize >= page.total}
                    onClick={() => void setFilters({ trang: page.page + 1 })}
                  >
                    Sau
                    <ChevronRight aria-hidden className="size-4" />
                  </Button>
                </div>
              </nav>
            )}
          </div>
        )}
      </DataState>
    </div>
  )
}
