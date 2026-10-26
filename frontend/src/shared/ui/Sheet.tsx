import type { HTMLAttributes } from 'react'
import { cn } from './cn'

/** Một "tờ" trắng trên bảng tin: vùng làm việc chính của mọi trang. */
export function Sheet({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('rounded-[var(--radius-sheet)] border border-rule bg-sheet', className)}
      {...rest}
    />
  )
}
