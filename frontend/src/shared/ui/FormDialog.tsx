import { X } from 'lucide-react'
import { useEffect, useRef, type ReactNode } from 'react'

/** Hộp thoại chứa một form, dùng <dialog> gốc để có sẵn bẫy focus và phím Esc. */
export function FormDialog({
  open,
  title,
  onClose,
  children,
}: {
  open: boolean
  title: string
  onClose: () => void
  children: ReactNode
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
        onClose()
      }}
      className="m-auto max-h-[calc(100dvh-2rem)] w-[min(34rem,calc(100vw-2rem))] rounded-[var(--radius-sheet)] border border-rule bg-sheet p-0 text-ink shadow-xl backdrop:bg-board-950/45"
    >
      <header className="sticky top-0 z-10 flex items-center justify-between border-b border-rule bg-sheet px-5 py-4">
        <h2 className="text-lg font-bold">{title}</h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Đóng"
          className="rounded p-1.5 text-ink-soft hover:bg-board-100"
        >
          <X aria-hidden className="size-5" />
        </button>
      </header>
      {open && children}
    </dialog>
  )
}
