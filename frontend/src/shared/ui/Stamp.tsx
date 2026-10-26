import type { CSSProperties } from 'react'
import { formatTime } from '@/shared/lib/datetime'
import { cn } from './cn'

/**
 * Dấu "ĐÃ TIẾP NHẬN" mực tím, kiểu dấu "Công văn đến" đóng tay. Điểm nhấn của hướng thiết kế.
 * `fresh` chạy hiệu ứng đóng dấu một lần, chỉ khi người dùng vừa bấm tiếp nhận.
 */
export function Stamp({
  name,
  at,
  fresh = false,
  tilt = -4,
  className,
}: {
  name: string
  at: string
  fresh?: boolean
  tilt?: number
  className?: string
}) {
  const style = { '--stamp-rotate': `${tilt}deg`, transform: `rotate(${tilt}deg)` } as CSSProperties
  return (
    <div
      style={style}
      className={cn(
        'inline-flex flex-col items-start gap-0.5 rounded-[3px] border-2 border-stamp bg-sheet/60 px-2.5 py-1.5 text-stamp',
        fresh && 'animate-[stamp-in_420ms_var(--ease-out-expo)_both]',
        className,
      )}
    >
      <span className="text-xs font-bold tracking-[0.08em] uppercase">Đã tiếp nhận</span>
      <span className="text-sm leading-tight font-semibold">{name}</span>
      <span className="tabular text-xs font-medium">{formatTime(at)}</span>
    </div>
  )
}
