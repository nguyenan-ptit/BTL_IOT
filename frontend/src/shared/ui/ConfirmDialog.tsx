import { useEffect, useRef, type ReactNode } from 'react'
import { Button, type ButtonProps } from './Button'

/** Hộp xác nhận dùng <dialog> gốc của trình duyệt: có sẵn bẫy focus và phím Esc. */
export function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel,
  confirmVariant = 'primary',
  loading = false,
  onConfirm,
  onCancel,
}: {
  open: boolean
  title: string
  children?: ReactNode
  confirmLabel: string
  confirmVariant?: ButtonProps['variant']
  loading?: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  const ref = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  }, [open])

  return (
    <dialog
      ref={ref}
      onCancel={(e) => {
        e.preventDefault()
        onCancel()
      }}
      className="m-auto w-[min(28rem,calc(100vw-2rem))] rounded-[var(--radius-sheet)] border border-rule bg-sheet p-0 text-ink shadow-xl backdrop:bg-board-950/45"
    >
      <div className="flex flex-col gap-3 p-5">
        <h2 className="text-lg font-bold">{title}</h2>
        {children && <div className="text-ink-soft">{children}</div>}
      </div>
      <div className="flex flex-col-reverse gap-2 border-t border-rule px-5 py-4 sm:flex-row sm:justify-end">
        <Button variant="secondary" onClick={onCancel} disabled={loading}>
          Hủy
        </Button>
        <Button variant={confirmVariant} onClick={onConfirm} loading={loading} autoFocus>
          {confirmLabel}
        </Button>
      </div>
    </dialog>
  )
}
