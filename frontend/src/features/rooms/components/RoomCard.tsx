import { Flame, Hourglass, Thermometer, TriangleAlert, Wind } from 'lucide-react'
import type { ReactNode } from 'react'
import { formatClock } from '@/shared/lib/datetime'
import { hazardSignLabel, roomNumber } from '@/shared/lib/labels'
import { formatInteger, formatTemperature } from '@/shared/lib/number'
import type { RoomOverall } from '@/shared/schemas/common'
import { cn } from '@/shared/ui/cn'
import { roomStatusStyle } from '@/shared/ui/status'
import { StatusPill } from '@/shared/ui/StatusPill'
import type { RoomStatus } from '../schemas'
import { GAS_MIN_VALID, isFault, type RoomNodeView, type SensorView } from '../sensors'

const sensorMeta = {
  gas: { label: 'Gas/khói', icon: Wind },
  temperature: { label: 'Nhiệt độ', icon: Thermometer },
  flame: { label: 'Lửa', icon: Flame },
} as const

function sensorValue(sensor: SensorView): string {
  if (sensor.value === null) return '—'
  if (sensor.kind === 'gas') return formatInteger(sensor.value as number)
  if (sensor.kind === 'temperature') return formatTemperature(sensor.value as number)
  return sensor.value ? 'Có lửa' : 'Không'
}

function SensorCell({ sensor, stale }: { sensor: SensorView; stale: boolean }) {
  const meta = sensorMeta[sensor.kind]
  const Icon = meta.icon
  const fault = isFault(sensor.state)
  const warming = sensor.state === 'warming_up'
  const flameOn = sensor.kind === 'flame' && sensor.value === true
  return (
    <div
      className={cn(
        'flex min-w-0 flex-col gap-0.5 rounded-[4px] px-2.5 py-2',
        fault
          ? 'bg-fault-wash ring-1 ring-fault ring-inset'
          : warming
            ? 'bg-board-100 ring-1 ring-board-200 ring-inset'
            : 'bg-ground',
      )}
    >
      <dt className="flex items-center gap-1 text-xs font-semibold text-ink-soft">
        <Icon aria-hidden className="size-3.5 shrink-0" />
        {meta.label}
      </dt>
      <dd
        className={cn(
          'tabular truncate text-base leading-tight font-bold',
          stale && !fault && 'text-ink-faint',
          flameOn && 'text-alarm-deep',
        )}
      >
        {fault ? (
          <span className="flex items-center gap-1 text-fault-ink">
            <TriangleAlert aria-hidden className="size-4" />
            Lỗi
          </span>
        ) : warming ? (
          <span className="flex items-center gap-1 text-board-900">
            <Hourglass aria-hidden className="size-4" />
            Làm nóng
          </span>
        ) : (
          sensorValue(sensor)
        )}
      </dd>
    </div>
  )
}

/** Một dòng giải thích cho mỗi cảm biến không ở trạng thái bình thường. */
function sensorNote(sensor: SensorView): string | null {
  const name = `Cảm biến ${sensorMeta[sensor.kind].label.toLowerCase()}`
  if (sensor.state === 'warming_up') {
    return sensor.warmupRemainingS
      ? `${name} đang làm nóng, còn ${sensor.warmupRemainingS} giây`
      : `${name} đang làm nóng`
  }
  if (sensor.state === 'low_signal') {
    return `${name} lỗi: số đo ${sensorValue(sensor)} dưới ${GAS_MIN_VALID}, kiểm tra dây và nguồn`
  }
  if (sensor.state === 'fault') return `${name} lỗi`
  return null
}

function nodeStatus(node: RoomNodeView): string {
  if (node.lifecycle === 'blocked') return 'Tạm khoá'
  if (node.lifecycle === 'maintenance') return 'Đang bảo trì'
  if (node.lifecycle === 'registered') return 'Chưa kích hoạt'
  if (node.lifecycle === 'retired') return 'Ngừng sử dụng'
  if (node.connectivity === 'offline') return 'Mất kết nối'
  return 'Đang kết nối'
}

function NodeReadings({ node, now }: { node: RoomNodeView; now: Date }) {
  const stale = node.connectivity === 'offline' && node.lastSeenAt !== null
  const notes = node.sensors.map(sensorNote).filter(Boolean)
  const when = node.lastSeenAt ? formatClock(node.lastSeenAt, now) : null

  return (
    <li className="flex min-w-0 flex-col gap-2 border-t border-rule pt-2.5">
      <div className="flex min-w-0 flex-wrap items-baseline justify-between gap-1 text-sm">
        <span className="min-w-0 font-semibold break-all">
          {node.id}
          {node.code !== node.id && (
            <span className="ml-2 font-normal text-ink-soft">{node.code}</span>
          )}
        </span>
        <span className={cn('text-xs font-semibold', stale ? 'text-offline-ink' : 'text-ink-soft')}>
          {nodeStatus(node)}
        </span>
      </div>
      {node.sensors.length > 0 && (
        <>
          <dl className="grid grid-cols-3 gap-2">
            {node.sensors.map((sensor) => (
              <SensorCell key={sensor.kind} sensor={sensor} stale={stale} />
            ))}
          </dl>
          {notes.length > 0 && (
            <p
              className={cn(
                'text-xs font-semibold',
                node.sensors.some((sensor) => isFault(sensor.state))
                  ? 'text-fault-ink'
                  : 'text-board-900',
              )}
            >
              {notes.join('. ')}
            </p>
          )}
          <p className={cn('tabular text-xs', stale ? 'text-offline-ink' : 'text-ink-soft')}>
            {when
              ? stale
                ? `Số đo cũ, nhận lúc ${when}`
                : `Nhận lúc ${when}`
              : 'Chưa gửi dữ liệu'}
          </p>
        </>
      )}
    </li>
  )
}

/** Thẻ một phòng trên trang tổng quan. */
export function RoomCard({
  status,
  nodes,
  overall,
  now,
  notice,
}: {
  status: RoomStatus
  nodes: RoomNodeView[]
  overall: RoomOverall
  now: Date
  notice?: ReactNode
}) {
  const style = roomStatusStyle[overall]
  const onlineCount = nodes.filter(
    (node) =>
      (node.lifecycle === 'active' || node.lifecycle === 'maintenance') &&
      node.connectivity === 'online',
  ).length

  return (
    <article
      aria-labelledby={`room-${status.room.id}`}
      className={cn(
        'flex h-full min-w-0 flex-col rounded-[var(--radius-sheet)] border-2',
        style.card,
      )}
    >
      {notice}
      <div className="flex min-w-0 flex-1 flex-col gap-3 p-4">
        <header className="flex min-w-0 items-start justify-between gap-3">
          <div className="min-w-0">
            <h2
              id={`room-${status.room.id}`}
              className="tabular truncate text-xl font-bold tracking-tight"
            >
              Phòng {roomNumber(status.room.name)}
            </h2>
            {nodes.length > 0 && (
              <p className="text-xs text-ink-soft">
                {onlineCount}/{nodes.length} node online
              </p>
            )}
          </div>
          <StatusPill status={overall} className="shrink-0 whitespace-nowrap" />
        </header>

        {overall === 'alarm' && status.hazardSigns.length > 0 && !notice && (
          <p className="flex items-center gap-1.5 text-sm font-semibold text-alarm-deep">
            <TriangleAlert aria-hidden className="size-4 shrink-0" />
            Phát hiện {status.hazardSigns.map((sign) => hazardSignLabel[sign]).join(', ')}
          </p>
        )}

        {nodes.length > 0 ? (
          <ul className="flex flex-col gap-3">
            {nodes.map((node) => (
              <NodeReadings key={node.id} node={node} now={now} />
            ))}
          </ul>
        ) : (
          <p className="text-sm text-ink-soft">Phòng chưa gắn node</p>
        )}
      </div>
    </article>
  )
}
