import type { ReactNode } from 'react'
import { RotateCw } from 'lucide-react'
import { Button } from './Button'
import { cn } from './cn'

type QueryLike<T> = {
  data: T | undefined
  isError: boolean
  isRefetching?: boolean
  refetch: () => unknown
}

/**
 * Bốn trạng thái của mọi trang lấy dữ liệu: đang tải (skeleton), rỗng, lỗi có thử lại, có dữ liệu.
 * Đã có dữ liệu mà lần lấy lại bị lỗi thì vẫn hiện dữ liệu cũ; dải mất kết nối ở AppShell báo việc đó.
 */
export function DataState<T>({
  query,
  isEmpty,
  skeleton,
  empty,
  children,
}: {
  query: QueryLike<T>
  isEmpty?: (data: T) => boolean
  skeleton: ReactNode
  empty: ReactNode
  children: (data: T) => ReactNode
}) {
  if (query.data !== undefined) {
    return isEmpty?.(query.data) ? <>{empty}</> : <>{children(query.data)}</>
  }
  if (query.isError) {
    return (
      <div
        role="alert"
        className="flex flex-col items-start gap-3 rounded-[var(--radius-sheet)] border border-rule bg-sheet p-5"
      >
        <p className="font-semibold">Không tải được dữ liệu.</p>
        <p className="text-sm text-ink-soft">
          Có thể máy chủ đang tắt hoặc mạng bị gián đoạn. Bấm thử lại sau ít giây.
        </p>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => query.refetch()}
          loading={query.isRefetching}
        >
          <RotateCw aria-hidden className="size-4" />
          Thử lại
        </Button>
      </div>
    )
  }
  return (
    <div role="status" aria-label="Đang tải">
      {skeleton}
    </div>
  )
}

export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn('animate-pulse rounded-[var(--radius-sheet)] bg-board-100', className)}
    />
  )
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-start gap-1 rounded-[var(--radius-sheet)] border border-dashed border-rule-strong p-6">
      <p className="font-semibold">{title}</p>
      {children && <div className="text-sm text-ink-soft">{children}</div>}
    </div>
  )
}
