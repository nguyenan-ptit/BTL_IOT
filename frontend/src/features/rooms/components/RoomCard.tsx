import {
  Flame,
  Hourglass,
  Info,
  Lock,
  Thermometer,
  TriangleAlert,
  WifiOff,
  Wind,
  Wrench,
} from 'lucide-react'
import type { ReactNode } from 'react'
import { formatClock } from '@/shared/lib/datetime'
import { hazardSignLabel, roomNumber } from '@/shared/lib/labels'
import { formatInteger, formatTemperature } from '@/shared/lib/number'
import type { RoomOverall } from '@/shared/schemas/common'
import { cn } from '@/shared/ui/cn'
import { roomStatusStyle } from '@/shared/ui/status'
import { StatusPill } from '@/shared/ui/StatusPill'
import type { RoomStatus } from '../schemas'
import { GAS_MIN_VALID, isFault, type SensorView } from '../sensors'

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

/** Chân thẻ: bên trái là node, bên phải là lúc nhận số đo gần nhất. */
function footer(
  status: RoomStatus,
  offline: boolean,
  now: Date,
  blockedNodeId: string | null,
): { node: string; when: string } {
  const node = status.node
  if (!node && blockedNodeId) return { node: blockedNodeId, when: 'Tạm khoá' }
  if (!node) return { node: 'Chưa gắn node', when: '' }
  if (node.lifecycle === 'registered') return { node: node.code, when: 'Chưa kích hoạt' }
  if (!node.lastSeenAt) return { node: node.code, when: 'Chưa gửi dữ liệu' }
  const at = formatClock(node.lastSeenAt, now)
  return { node: node.code, when: offline ? `Mất tín hiệu từ ${at}` : `Nhận lúc ${at}` }
}

type Line = { text: string; tone: string; icon: typeof Lock }

/** Điều quan trọng nhất cần nói thêm về phòng, theo thứ tự ưu tiên; `null` khi không có gì. */
function statusLine(v: {
  status: RoomStatus
  overall: RoomOverall
  stale: boolean
  faultNotes: (string | null)[]
  warmingNotes: (string | null)[]
  hasNotice: boolean
}): Line | null {
  const { status, overall, stale } = v
  if (overall === 'blocked') {
    return {
      text: 'Node bị quản trị viên tạm khoá, phòng chưa được giám sát',
      tone: 'text-board-900',
      icon: Lock,
    }
  }
  if (!status.node) return { text: 'Phòng chưa gắn node', tone: 'text-ink-soft', icon: Info }
  if (stale) {
    return {
      text:
        overall === 'alarm'
          ? 'Node mất kết nối, cảnh báo giữ tới khi có số đo mới'
          : 'Node mất kết nối, số đo là số đo cũ',
      tone: 'text-offline-ink',
      icon: WifiOff,
    }
  }
  if (overall === 'alarm' && status.hazardSigns.length > 0 && !v.hasNotice) {
    return {
      text: `Phát hiện: ${status.hazardSigns.map((s) => hazardSignLabel[s]).join(', ')}`,
      tone: 'text-alarm-deep',
      icon: TriangleAlert,
    }
  }
  if (overall === 'maintenance') {
    return {
      text: 'Đang bảo trì, số đo chỉ để tham khảo',
      tone: 'text-maintenance-ink',
      icon: Wrench,
    }
  }
  if (v.faultNotes.length > 0) {
    return { text: v.faultNotes.join('. '), tone: 'text-fault-ink', icon: TriangleAlert }
  }
  if (v.warmingNotes.length > 0) {
    return { text: v.warmingNotes.join('. '), tone: 'text-board-900', icon: Hourglass }
  }
  return null
}

/** Thẻ một phòng trên trang tổng quan (US1). `notice` là tờ sự cố ghim lên thẻ (US2). */
export function RoomCard({
  status,
  sensors,
  overall,
  now,
  notice,
  blockedNodeId = null,
}: {
  status: RoomStatus
  sensors: SensorView[]
  overall: RoomOverall
  now: Date
  notice?: ReactNode
  /** Node của phòng đang bị quản trị viên khoá (không có trong /api/rooms/status). */
  blockedNodeId?: string | null
}) {
  const style = roomStatusStyle[overall]
  // Node mất kết nối thì số đo là số đo cũ, kể cả khi phòng đang cảnh báo hoặc bảo trì (lỗi A).
  const stale = status.node?.connectivity === 'offline' && status.node.lastSeenAt !== null
  // Không có node đang chạy (chưa gắn, bị khoá) thì backend không có số đo: không phải lỗi cảm biến.
  const faultNotes = status.node ? sensors.filter((s) => isFault(s.state)).map(sensorNote) : []
  const warmingNotes = sensors.filter((s) => s.state === 'warming_up').map(sensorNote)
  const foot = footer(status, stale, now, blockedNodeId)
  const line = statusLine({ status, overall, stale, faultNotes, warmingNotes, hasNotice: !!notice })

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
        <header className="flex min-w-0 items-center justify-between gap-3">
          <h2
            id={`room-${status.room.id}`}
            className="tabular truncate text-xl font-bold tracking-tight"
          >
            Phòng {roomNumber(status.room.name)}
          </h2>
          <StatusPill status={overall} className="shrink-0 whitespace-nowrap" />
        </header>

        {/* Một dòng cố định cho điều quan trọng nhất, để thẻ không cao lên khi có thêm thông tin. */}
        <p
          className={cn('flex h-5 min-w-0 items-center gap-1.5 text-sm font-semibold', line?.tone)}
          title={line?.text}
        >
          {line && <line.icon aria-hidden className="size-4 shrink-0" />}
          <span className="min-w-0 truncate">{line?.text}</span>
        </p>

        {status.node && (
          <dl className="grid grid-cols-3 gap-2">
            {sensors.map((sensor) => (
              <SensorCell key={sensor.kind} sensor={sensor} stale={stale} />
            ))}
          </dl>
        )}

        <footer
          className={cn(
            'mt-auto flex items-center justify-between gap-3 border-t border-rule pt-2.5 text-xs',
            stale ? 'font-semibold text-offline-ink' : 'text-ink-soft',
          )}
        >
          <span className="truncate">{foot.node}</span>
          <span className="tabular shrink-0">{foot.when}</span>
        </footer>
      </div>
    </article>
  )
}
