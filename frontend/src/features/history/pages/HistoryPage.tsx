import { useRoomStatuses } from '@/features/rooms/hooks'
import { cn } from '@/shared/ui/cn'
import { DataState, EmptyState, Skeleton } from '@/shared/ui/DataState'
import { inputClass } from '@/shared/ui/Field'
import { Sheet } from '@/shared/ui/Sheet'
import { HISTORY_LIMIT } from '../api'
import { HistoryChart } from '../components/HistoryChart'
import { HistoryTable } from '../components/HistoryTable'
import { customRange, RANGE_OPTIONS, useHistoryFilters, type RangeOption } from '../filters'
import { useMeasurements } from '../hooks'
import { roomNumber } from '@/shared/lib/labels'

const rangeLabel: Record<RangeOption, string> = {
  'gan-nhat': `${HISTORY_LIMIT} mẫu gần nhất`,
  'tuy-chon': 'Tự chọn',
}

/**
 * Lịch sử số đo (US3): chọn phòng, xem tối đa 100 mẫu của node đang gắn với phòng.
 * Backend không gộp dữ liệu theo phút/giờ, nên không có khung 24 giờ/7 ngày.
 */
export default function HistoryPage() {
  const [filters, setFilters] = useHistoryFilters()
  const rooms = useRoomStatuses()
  const statuses = rooms.data?.map((r) => r.status)
  const selected = statuses?.find((s) => s.room.id === filters.phong) ?? statuses?.[0]
  const deviceId = selected?.node?.id ?? null

  const custom = filters.khoang === 'tuy-chon'
  const range = custom ? customRange(filters.tu, filters.den) : null
  const waitingForRange = custom && range === null
  const history = useMeasurements(waitingForRange ? null : deviceId, range)

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
            value={selected?.room.id ?? ''}
            onChange={(e) => void setFilters({ phong: e.target.value })}
          >
            {statuses?.map((s) => (
              <option key={s.room.id} value={s.room.id}>
                Phòng {roomNumber(s.room.name)}
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

      {rooms.isPending ? (
        <Skeleton className="h-80" />
      ) : statuses?.length === 0 ? (
        <EmptyState title="Chưa có phòng nào">Tài khoản của bạn chưa được gán phòng.</EmptyState>
      ) : !deviceId ? (
        <EmptyState title="Phòng chưa có node đang hoạt động">
          Phòng này chưa gắn node đang sử dụng hoặc bảo trì, nên chưa có số đo.
        </EmptyState>
      ) : waitingForRange ? (
        <EmptyState title="Chọn khoảng thời gian">
          Chọn ngày bắt đầu và ngày kết thúc để xem số đo.
        </EmptyState>
      ) : (
        <DataState
          query={history}
          isEmpty={(data) => data.measurements.length === 0}
          skeleton={<Skeleton className="h-80" />}
          empty={
            <EmptyState title="Không có số đo">
              Node chưa gửi số đo nào trong khoảng thời gian đã chọn.
            </EmptyState>
          }
        >
          {(data) => (
            <div className="flex flex-col gap-5">
              {data.truncated && (
                <p className="text-sm text-ink-soft">
                  Chỉ hiển thị {HISTORY_LIMIT} mẫu mới nhất trong khoảng này (khoảng 3 phút dữ
                  liệu).
                </p>
              )}
              <Sheet className="p-4">
                <HistoryChart measurements={data.measurements} thresholds={data.thresholds} />
              </Sheet>

              <section aria-labelledby="history-table" className="flex flex-col gap-2">
                <h2 id="history-table" className="font-bold">
                  Bảng số đo{' '}
                  <span className="text-sm font-normal text-ink-soft">
                    ({data.measurements.length} dòng)
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
