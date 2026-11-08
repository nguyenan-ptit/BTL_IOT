import { Info, Wifi, WifiOff } from 'lucide-react'
import { controlBlockReason, currentThresholds, isWaiting } from '@/features/devices/adapters'
import { commandStatusLabel } from '@/features/devices/labels'
import type { DeviceItem } from '@/features/devices/schemas'
import { formatInteger, formatTemperature } from '@/shared/lib/number'
import { Button } from '@/shared/ui/Button'
import { cn } from '@/shared/ui/cn'
import type { ThresholdValues } from '../schemas'
import { BuzzerTestButton } from './BuzzerTestButton'
import { roomNumber } from '@/shared/lib/labels'

function Pair({ label, on, off }: { label: string; on: string; off: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs font-semibold text-ink-soft">{label}</dt>
      <dd className="tabular font-bold">
        bật {on} <span className="font-normal text-ink-soft">· tắt {off}</span>
      </dd>
    </div>
  )
}

function Values({ v }: { v: ThresholdValues }) {
  return (
    <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <Pair label="Gas/khói (ADC)" on={formatInteger(v.gasOn)} off={formatInteger(v.gasOff)} />
      <Pair label="Nhiệt độ" on={formatTemperature(v.tempOn)} off={formatTemperature(v.tempOff)} />
    </dl>
  )
}

/** Kết quả lệnh gần nhất do backend theo dõi; chỉ "applied/completed" mới là ESP đã xác nhận. */
function CommandStatus({
  title,
  status,
  message,
}: {
  title: string
  status: keyof typeof commandStatusLabel
  message: string
}) {
  const waiting = isWaiting(status)
  return (
    <div
      role="status"
      className={cn(
        'rounded-[4px] px-3 py-2 text-sm',
        waiting ? 'bg-board-100 text-board-900' : 'bg-ground text-ink',
      )}
    >
      <p className="font-semibold">
        {title}: {commandStatusLabel[status]}
      </p>
      <p className="text-ink-soft">{message}</p>
    </div>
  )
}

export function DeviceControlCard({
  item,
  roomName,
  onEdit,
}: {
  item: DeviceItem
  roomName: string
  onEdit: () => void
}) {
  const blocked = controlBlockReason(item, 'thresholds')
  const thresholdCommand = item.remote_control.pending
  const buzzerCommand = item.buzzer_control.pending

  return (
    <li className="flex flex-col gap-4 rounded-[var(--radius-sheet)] border border-rule bg-sheet p-4">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="tabular text-xl font-bold">Phòng {roomNumber(roomName)}</h2>
        <span className="text-sm text-ink-soft">Node {item.device_id}</span>
        <span
          className={cn(
            'ml-auto inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-sm leading-none font-semibold whitespace-nowrap ring-1 ring-inset',
            item.online
              ? 'bg-normal-wash text-normal-ink ring-normal/40'
              : 'bg-offline-wash text-offline-ink ring-offline/40',
          )}
        >
          {item.online ? (
            <Wifi aria-hidden className="size-4" />
          ) : (
            <WifiOff aria-hidden className="size-4" />
          )}
          {item.online ? 'Đang kết nối' : 'Mất kết nối'}
        </span>
      </div>

      {item.data ? (
        <div className="flex flex-col gap-2">
          <p className="text-xs font-semibold text-ink-soft">Node đang dùng</p>
          <Values v={currentThresholds(item.data)} />
        </div>
      ) : (
        <p className="text-sm text-ink-soft">
          Chưa có dữ liệu từ node nên chưa biết ngưỡng đang dùng.
        </p>
      )}

      {thresholdCommand && (
        <CommandStatus
          title="Lệnh đổi ngưỡng"
          status={thresholdCommand.status}
          message={thresholdCommand.message}
        />
      )}
      {buzzerCommand && (
        <CommandStatus
          title="Thử còi và đèn"
          status={buzzerCommand.status}
          message={buzzerCommand.message}
        />
      )}

      <div className="flex flex-wrap items-start justify-between gap-3 border-t border-rule pt-3">
        <BuzzerTestButton item={item} />
        <div className="flex flex-col items-end gap-1">
          <Button variant="secondary" size="sm" disabled={blocked !== null} onClick={onEdit}>
            Sửa ngưỡng
          </Button>
          {blocked && (
            <p className="flex items-center gap-1 text-xs text-ink-soft">
              <Info aria-hidden className="size-3.5" />
              {blocked}
            </p>
          )}
        </div>
      </div>
    </li>
  )
}
