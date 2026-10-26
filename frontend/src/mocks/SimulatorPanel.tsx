import { FlaskConical, X } from 'lucide-react'
import { useState } from 'react'
import { db } from './db'
import { scenarios } from './simulator'

// Bảng điều khiển kịch bản mô phỏng (quickstart.md). Chỉ được nạp khi VITE_USE_MOCK=true,
// nên không có trong bản build nối backend thật.
const actions: { label: string; run: (roomId: string) => void }[] = [
  { label: 'Rò gas', run: scenarios.gasLeak },
  { label: 'Cháy', run: scenarios.fire },
  { label: 'Hỏng cảm biến nhiệt', run: (id) => scenarios.breakSensor(id, 'temperature') },
  { label: 'Hỏng cảm biến gas', run: (id) => scenarios.breakSensor(id, 'gas') },
  { label: 'Rút nguồn node', run: scenarios.unplug },
  { label: 'Cắm lại, gửi bù', run: (id) => scenarios.replug(id, true) },
  { label: 'Về bình thường', run: scenarios.recover },
]

export default function SimulatorPanel() {
  const [open, setOpen] = useState(false)
  const [roomId, setRoomId] = useState('r101')
  const [last, setLast] = useState<string | null>(null)
  const rooms = db.rooms.filter((r) => r.activeNodeId)

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed right-4 bottom-20 z-40 flex items-center gap-2 rounded-full bg-ink px-4 py-2.5 text-sm font-semibold text-white shadow-lg md:bottom-4"
      >
        <FlaskConical aria-hidden className="size-4" />
        Mô phỏng
      </button>
    )
  }

  return (
    <section
      aria-label="Bảng mô phỏng"
      className="fixed right-4 bottom-20 z-40 w-[min(20rem,calc(100vw-2rem))] rounded-[var(--radius-sheet)] border border-rule bg-sheet shadow-xl md:bottom-4"
    >
      <header className="flex items-center justify-between border-b border-rule px-4 py-3">
        <div>
          <h2 className="text-sm font-bold">Mô phỏng node</h2>
          <p className="text-xs text-ink-soft">Chỉ có khi chạy dữ liệu giả lập</p>
        </div>
        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-label="Đóng bảng mô phỏng"
          className="rounded p-1 text-ink-soft hover:bg-board-100"
        >
          <X aria-hidden className="size-4" />
        </button>
      </header>
      <div className="flex flex-col gap-3 p-4">
        <div role="radiogroup" aria-label="Phòng" className="flex gap-2">
          {rooms.map((room) => (
            <button
              key={room.id}
              type="button"
              role="radio"
              aria-checked={roomId === room.id}
              onClick={() => setRoomId(room.id)}
              className="tabular rounded-[var(--radius-sheet)] px-3 py-1.5 text-sm font-bold ring-1 ring-rule-strong ring-inset aria-checked:bg-board-900 aria-checked:text-white aria-checked:ring-board-900"
            >
              Phòng {room.name}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-2">
          {actions.map((action) => (
            <button
              key={action.label}
              type="button"
              className="min-h-9 rounded-[var(--radius-sheet)] px-2 py-1.5 text-sm leading-tight font-semibold ring-1 ring-rule-strong ring-inset hover:bg-board-100"
              onClick={() => {
                action.run(roomId)
                setLast(`${action.label} · phòng ${roomId.slice(1)}`)
              }}
            >
              {action.label}
            </button>
          ))}
        </div>
        <p aria-live="polite" className="min-h-5 text-xs text-ink-soft">
          {last && `Đã chạy: ${last}`}
        </p>
      </div>
    </section>
  )
}
