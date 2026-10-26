import type { ButtonHTMLAttributes } from 'react'
import { LoaderCircle } from 'lucide-react'
import { cn } from './cn'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'stamp' | 'stampOnAlarm'
type Size = 'sm' | 'md' | 'lg'

const variants: Record<Variant, string> = {
  primary: 'bg-board-900 text-white hover:bg-board-800 active:bg-board-950',
  secondary: 'bg-sheet text-ink ring-1 ring-inset ring-rule-strong hover:bg-board-100',
  ghost: 'text-ink-soft hover:bg-board-100 hover:text-ink',
  danger: 'bg-alarm text-white hover:bg-alarm-deep',
  // Nút tiếp nhận mang mực dấu tím; màu này chỉ dành cho việc tiếp nhận.
  stamp: 'bg-stamp text-white hover:brightness-110 active:brightness-95',
  // Cùng nút tiếp nhận, đặt trên tờ thông báo đỏ.
  stampOnAlarm: 'bg-sheet text-stamp hover:bg-stamp-wash',
}

const sizes: Record<Size, string> = {
  sm: 'h-8 px-3 text-sm',
  md: 'h-10 px-4 text-sm',
  lg: 'h-12 px-5 text-base',
}

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant
  size?: Size
  loading?: boolean
}

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled,
  className,
  children,
  type = 'button',
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-[var(--radius-sheet)] font-semibold whitespace-nowrap select-none transition-[background-color,filter,box-shadow] duration-150 disabled:cursor-not-allowed disabled:opacity-55',
        variants[variant],
        sizes[size],
        className,
      )}
      {...rest}
    >
      {loading && <LoaderCircle aria-hidden className="size-4 animate-spin" />}
      {children}
    </button>
  )
}
