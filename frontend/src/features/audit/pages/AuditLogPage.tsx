import { ChevronLeft, ChevronRight, X } from 'lucide-react'
import {
  parseAsArrayOf,
  parseAsInteger,
  parseAsString,
  parseAsStringLiteral,
  useQueryStates,
} from 'nuqs'
import { formatDateTime } from '@/shared/lib/datetime'
import { auditActionLabel } from '@/shared/lib/labels'
import { auditActionSchema } from '@/shared/schemas/common'
import { Button } from '@/shared/ui/Button'
import { cn } from '@/shared/ui/cn'
import { DataState, EmptyState, Skeleton } from '@/shared/ui/DataState'
import { inputClass } from '@/shared/ui/Field'
import { Sheet } from '@/shared/ui/Sheet'
import { useAuditLogs } from '../api'

function dayBound(day: string | null, end: boolean): string | null {
  return day ? new Date(`${day}T${end ? '23:59:59.999' : '00:00:00'}+07:00`).toISOString() : null
}

/** Nhật ký thao tác (US6, chỉ quản trị viên): mới nhất ở trên, lọc theo loại và ngày. */
export default function AuditLogPage() {
  const [filters, setFilters] = useQueryStates(
    {
      loai: parseAsArrayOf(parseAsStringLiteral(auditActionSchema.options)).withDefault([]),
      tu: parseAsString,
      den: parseAsString,
      trang: parseAsInteger.withDefault(1),
    },
    { history: 'replace' },
  )
  const logs = useAuditLogs({
    actions: filters.loai,
    from: dayBound(filters.tu, false),
    to: dayBound(filters.den, true),
    page: filters.trang,
  })
  const hasFilter = filters.loai.length > 0 || !!filters.tu || !!filters.den

  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-2xl font-bold tracking-tight">Nhật ký thao tác</h1>

      <Sheet className="flex flex-col gap-4 p-4">
        <fieldset>
          <legend className="mb-2 text-sm font-semibold">Loại thao tác</legend>
          <div className="flex flex-wrap gap-2">
            {auditActionSchema.options.map((a) => {
              const on = filters.loai.includes(a)
              return (
                <button
                  key={a}
                  type="button"
                  aria-pressed={on}
                  onClick={() =>
                    void setFilters({
                      loai: on ? filters.loai.filter((x) => x !== a) : [...filters.loai, a],
                      trang: 1,
                    })
                  }
                  className="h-9 rounded-full bg-sheet px-3.5 text-sm font-semibold ring-1 ring-rule-strong ring-inset hover:bg-board-100 aria-pressed:bg-board-900 aria-pressed:text-white aria-pressed:ring-board-900"
                >
                  {auditActionLabel[a]}
                </button>
              )
            })}
          </div>
        </fieldset>
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="audit-from" className="text-sm font-semibold">
              Từ ngày
            </label>
            <input
              id="audit-from"
              type="date"
              className={cn(inputClass, 'w-44')}
              value={filters.tu ?? ''}
              max={filters.den ?? undefined}
              onChange={(e) => void setFilters({ tu: e.target.value || null, trang: 1 })}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="audit-to" className="text-sm font-semibold">
              Đến ngày
            </label>
            <input
              id="audit-to"
              type="date"
              className={cn(inputClass, 'w-44')}
              value={filters.den ?? ''}
              min={filters.tu ?? undefined}
              onChange={(e) => void setFilters({ den: e.target.value || null, trang: 1 })}
            />
          </div>
          {hasFilter && (
            <Button
              variant="ghost"
              className="h-11"
              onClick={() => void setFilters({ loai: [], tu: null, den: null, trang: 1 })}
            >
              <X aria-hidden className="size-4" />
              Bỏ lọc
            </Button>
          )}
        </div>
      </Sheet>

      <DataState
        query={logs}
        isEmpty={(d) => d.items.length === 0}
        skeleton={<Skeleton className="h-56" />}
        empty={
          <EmptyState
            title={hasFilter ? 'Không có thao tác nào khớp bộ lọc' : 'Chưa có thao tác nào'}
          >
            {hasFilter
              ? 'Thử bỏ bớt điều kiện lọc.'
              : 'Các thao tác như đổi quyền, gán phòng, chuyển trạng thái node, tiếp nhận sự cố sẽ được ghi ở đây.'}
          </EmptyState>
        }
      >
        {(page) => (
          <div className="flex flex-col gap-3">
            <ol className="flex flex-col divide-y divide-rule rounded-[var(--radius-sheet)] border border-rule bg-sheet">
              {page.items.map((e) => (
                <li
                  key={e.id}
                  className="grid gap-x-4 gap-y-1 px-4 py-3 sm:grid-cols-[11rem_10rem_1fr]"
                >
                  <span className="tabular text-sm text-ink-soft">{formatDateTime(e.at)}</span>
                  <span className="text-sm font-semibold">{auditActionLabel[e.action]}</span>
                  <span>
                    {e.summary}
                    <span className="block text-sm text-ink-soft">
                      Người làm: {e.actor.displayName}
                    </span>
                  </span>
                </li>
              ))}
            </ol>
            {page.total > page.pageSize && (
              <nav aria-label="Phân trang" className="flex items-center justify-between gap-3">
                <p className="text-sm text-ink-soft">
                  Trang {page.page} / {Math.ceil(page.total / page.pageSize)}
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
