import { Flame, Thermometer, TriangleAlert, Wind } from 'lucide-react'
import type { ReactNode } from 'react'
import { formatRelative, formatTime } from '@/shared/lib/datetime'
import { hazardSignLabel } from '@/shared/lib/labels'
import { formatInteger, formatTemperature } from '@/shared/lib/number'
import type { RoomOverall } from '@/shared/schemas/common'
import { cn } from '@/shared/ui/cn'
import { roomStatusStyle } from '@/shared/ui/status'
import { StatusPill } from '@/shared/ui/StatusPill'
import type { RoomStatus, SensorReading } from '../schemas'

const sensorMeta = {
  gas: { label: 'Gas/khói', icon: Wind },
  temperature: { label: 'Nhiệt độ', icon: Thermometer },
  flame: { label: 'Lửa', icon: Flame },
} as const

function sensorValue(sensor: SensorReading): string {
  if (sensor.value === null) return '—'
  if (sensor.kind === 'gas') return formatInteger(sensor.value)
  if (sensor.kind === 'temperature') return formatTemperature(sensor.value)
  return sensor.value ? 'Có lửa' : 'Không'
}

function SensorCell({ sensor, stale }: { sensor: SensorReading; stale: boolean }) {
  const meta = sensorMeta[sensor.kind]
  const Icon = meta.icon
  const fault = sensor.health === 'fault'
  const flameOn = sensor.kind === 'flame' && sensor.value === true
  return (
    <div
      className={cn(
        'flex min-w-0 flex-col gap-1 rounded-[4px] px-2.5 py-2',
        fault ? 'bg-fault-wash ring-1 ring-fault ring-inset' : 'bg-ground',
      )}
    >
      <dt className="flex items-center gap-1 text-xs font-semibold text-ink-soft">
        <Icon aria-hidden className="size-3.5 shrink-0" />
        {meta.label}
      </dt>
      <dd
        className={cn(
          'tabular truncate text-lg leading-tight font-bold',
          stale && !fault && 'text-ink-faint',
          flameOn && 'text-alarm-deep',
        )}
      >
        {fault ? (
          <span className="flex items-center gap-1 text-base text-fault-ink">
            <TriangleAlert aria-hidden className="size-4" />
            Lỗi
          </span>
        ) : (
          sensorValue(sensor)
        )}
      </dd>
    </div>
  )
}

function footerText(status: RoomStatus, overall: RoomOverall, now: Date): ReactNode {
  const node = status.node
  if (!node) return 'Phòng chưa gắn node.'
  if (node.lifecycle === 'registered') return `${node.code} mới đăng ký, chưa kích hoạt.`
  if (!node.lastSeenAt) return `${node.code} chưa gửi dữ liệu.`
  const when = `${formatTime(node.lastSeenAt)} (${formatRelative(node.lastSeenAt, now)})`
  if (overall === 'offline') return `Mất tín hiệu từ ${when}. Số đo bên trên là số đo cũ.`
  return `${node.code} · nhận lúc ${when}`
}

/** Thẻ một phòng trên trang tổng quan (US1). `notice` là tờ sự cố ghim lên thẻ (US2). */
export function RoomCard({
  status,
  overall,
  now,
  notice,
}: {
  status: RoomStatus
  overall: RoomOverall
  now: Date
  notice?: ReactNode
}) {
  const style = roomStatusStyle[overall]
  const stale = overall === 'offline'
  const faulty = status.sensors.filter((s) => s.health === 'fault')

  return (
    <article
      aria-labelledby={`room-${status.room.id}`}
      className={cn('flex flex-col rounded-[var(--radius-sheet)] border-2', style.card)}
    >
      {notice}
      <div className="flex flex-1 flex-col gap-4 p-4">
        <header className="flex items-start justify-between gap-3">
          <h2 id={`room-${status.room.id}`} className="flex items-baseline gap-1.5 leading-none">
            <span className="text-sm font-semibold text-ink-soft">Phòng</span>
            <span className="tabular text-4xl font-bold tracking-tight">{status.room.name}</span>
          </h2>
          <StatusPill status={overall} />
        </header>

        {overall === 'alarm' && status.hazardSigns.length > 0 && !notice && (
          <p className="text-sm font-semibold text-alarm-deep">
            Phát hiện: {status.hazardSigns.map((s) => hazardSignLabel[s]).join(', ')}
          </p>
        )}
        {faulty.length > 0 && overall !== 'maintenance' && (
          <p className="text-sm font-semibold text-fault-ink">
            {faulty.map((s) => `Cảm biến ${sensorMeta[s.kind].label.toLowerCase()} lỗi`).join(', ')}
          </p>
        )}
        {overall === 'maintenance' && (
          <p className="text-sm font-semibold text-maintenance-ink">
            Node đang bảo trì, số đo chỉ để tham khảo.
          </p>
        )}

        {status.node && (
          <dl className="grid grid-cols-3 gap-2">
            {status.sensors.map((sensor) => (
              <SensorCell key={sensor.kind} sensor={sensor} stale={stale} />
            ))}
          </dl>
        )}

        <p
          className={cn(
            'mt-auto text-xs',
            stale ? 'font-semibold text-offline-ink' : 'text-ink-soft',
          )}
        >
          {footerText(status, overall, now)}
        </p>
      </div>
    </article>
  )
}
