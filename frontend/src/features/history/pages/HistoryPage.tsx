import { ChevronRight } from 'lucide-react'
import { Link } from 'react-router'
import { useRooms } from '@/features/rooms/hooks'
import { formatDateTime, formatTime } from '@/shared/lib/datetime'
import { cn } from '@/shared/ui/cn'
import { DataState, EmptyState, Skeleton } from '@/shared/ui/DataState'
import { inputClass } from '@/shared/ui/Field'
import { Sheet } from '@/shared/ui/Sheet'
import { resolveRange, type HistoryRange } from '../api'
import { HistoryChart } from '../components/HistoryChart'
import { HistoryTable } from '../components/HistoryTable'
import { customRange, RANGE_OPTIONS, useHistoryFilters, type RangeOption } from '../filters'
import { useMeasurements } from '../hooks'

const rangeLabel: Record<RangeOption, string> = {
  '1h': '1 giờ',
  '24h': '24 giờ',
  '7d': '7 ngày',
  'tuy-chon': 'Tự chọn',
}

/** Lịch sử số đo (US3): chọn phòng và khoảng thời gian, xem biểu đồ và bảng. */
export default function HistoryPage() {
  const [filters, setFilters] = useHistoryFilters()
  const rooms = useRooms()
  const roomId = filters.phong ?? rooms.data?.[0]?.id ?? null

  const custom = filters.khoang === 'tuy-chon'
  const range: HistoryRange | null = custom
    ? customRange(filters.tu, filters.den)
    : { preset: filters.khoang as '1h' | '24h' | '7d' }
  const tooLong =
    custom &&
    range &&
    'from' in range &&
    Date.parse(range.to) - Date.parse(range.from) > 31 * 86_400_000
  const history = useMeasurements(tooLong ? null : roomId, range ?? { preset: '24h' })
  const ready = !!roomId && !!range && !tooLong
  const resolved = range ? resolveRange(range) : null
  const spanMs = resolved ? Date.parse(resolved.to) - Date.parse(resolved.from) : 0

  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-2xl font-bold tracking-tight">Lịch sử số đo</h1>

      <Sheet className="flex flex-col gap-3 p-4 lg:flex-row lg:flex-wrap lg:items-end">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="history-room" className="text-sm font-semibold">
            Phòng
          </label>
          <select
            id="history-room"
            className={cn(inputClass, 'lg:w-40')}
            value={roomId ?? ''}
            onChange={(e) => void setFilters({ phong: e.target.value })}
          >
            {rooms.data?.map((room) => (
              <option key={room.id} value={room.id}>
                Phòng {room.name}
              </option>
            ))}
          </select>
        </div>

        <fieldset className="flex flex-col gap-1.5">
          <legend className="mb-1.5 text-sm font-semibold">Khoảng thời gian</legend>
          <div className="inline-flex rounded-[var(--radius-sheet)] ring-1 ring-rule-strong ring-inset">
            {RANGE_OPTIONS.map((option) => (
              <button
                key={option}
                type="button"
                aria-pressed={filters.khoang === option}
                onClick={() => void setFilters({ khoang: option })}
                className="h-11 flex-1 px-3.5 text-sm font-semibold whitespace-nowrap first:rounded-l-[var(--radius-sheet)] last:rounded-r-[var(--radius-sheet)] hover:bg-board-100 aria-pressed:bg-board-900 aria-pressed:text-white"
              >
                {rangeLabel[option]}
              </button>
            ))}
          </div>
        </fieldset>

        {custom && (
          <div className="grid grid-cols-2 gap-3 lg:flex">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="history-from" className="text-sm font-semibold">
                Từ ngày
              </label>
              <input
                id="history-from"
                type="date"
                className={cn(inputClass, 'lg:w-44')}
                value={filters.tu ?? ''}
                max={filters.den ?? undefined}
                onChange={(e) => void setFilters({ tu: e.target.value || null })}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="history-to" className="text-sm font-semibold">
                Đến ngày
              </label>
              <input
                id="history-to"
                type="date"
                className={cn(inputClass, 'lg:w-44')}
                value={filters.den ?? ''}
                min={filters.tu ?? undefined}
                onChange={(e) => void setFilters({ den: e.target.value || null })}
              />
            </div>
          </div>
        )}
      </Sheet>

      {rooms.data?.length === 0 ? (
        <EmptyState title="Chưa có phòng nào">Tài khoản của bạn chưa được gán phòng.</EmptyState>
      ) : tooLong ? (
        <EmptyState title="Khoảng thời gian quá dài">Chọn tối đa 31 ngày.</EmptyState>
      ) : !ready ? (
        <EmptyState title="Chọn khoảng thời gian">
          Chọn ngày bắt đầu và ngày kết thúc để xem số đo.
        </EmptyState>
      ) : (
        <DataState
          query={history}
          isEmpty={(data) => data.measurements.length === 0}
          skeleton={<Skeleton className="h-80" />}
          empty={
            <EmptyState title="Không có số đo trong khoảng này">
              Phòng chưa gửi số đo nào trong khoảng thời gian đã chọn. Thử chọn khoảng khác.
            </EmptyState>
          }
        >
          {(data) => (
            <div className="flex flex-col gap-5">
              <Sheet className="p-4">
                <HistoryChart data={data} spanMs={spanMs} />
              </Sheet>

              {data.incidents.length > 0 && (
                <section aria-labelledby="history-incidents" className="flex flex-col gap-2">
                  <h2 id="history-incidents" className="font-bold">
                    Sự cố trong khoảng này
                  </h2>
                  <ul className="flex flex-wrap gap-2">
                    {data.incidents.map((i) => (
                      <li key={i.id}>
                        <Link
                          to={`/su-co/${i.id}`}
                          className="tabular flex items-center gap-1 rounded-full bg-alarm-wash px-3 py-1.5 text-sm font-semibold text-alarm-deep ring-1 ring-alarm/40 ring-inset hover:bg-alarm hover:text-white"
                        >
                          {formatDateTime(i.startedAt)} →{' '}
                          {i.resolvedAt ? formatTime(i.resolvedAt) : 'đang diễn ra'}
                          <ChevronRight aria-hidden className="size-4" />
                        </Link>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              <section aria-labelledby="history-table" className="flex flex-col gap-2">
                <h2 id="history-table" className="font-bold">
                  Bảng số đo{' '}
                  <span className="text-sm font-normal text-ink-soft">
                    ({data.measurements.length} dòng
                    {spanMs > 2 * 3_600_000 && ', mỗi dòng là trung bình một khung thời gian'})
                  </span>
                </h2>
                <HistoryTable measurements={data.measurements} />
              </section>
            </div>
          )}
        </DataState>
      )}
    </div>
  )
}
