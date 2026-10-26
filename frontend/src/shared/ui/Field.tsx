import type { InputHTMLAttributes, ReactNode, Ref } from 'react'
import { cn } from './cn'

export const inputClass =
  'h-11 w-full rounded-[var(--radius-sheet)] border border-rule-strong bg-sheet px-3 text-base text-ink placeholder:text-ink-faint focus:border-board-800 focus:ring-2 focus:ring-board-200 focus:outline-none aria-[invalid=true]:border-alarm'

export function Field({
  id,
  label,
  error,
  hint,
  children,
}: {
  id: string
  label: string
  error?: string
  hint?: ReactNode
  children: ReactNode
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-semibold text-ink">
        {label}
      </label>
      {children}
      {hint && !error && <p className="text-sm text-ink-soft">{hint}</p>}
      {error && (
        <p id={`${id}-error`} className="text-sm font-medium text-alarm-deep">
          {error}
        </p>
      )}
    </div>
  )
}

export function TextInput({
  className,
  ref,
  ...rest
}: InputHTMLAttributes<HTMLInputElement> & { ref?: Ref<HTMLInputElement> }) {
  return <input ref={ref} className={cn(inputClass, className)} {...rest} />
}
