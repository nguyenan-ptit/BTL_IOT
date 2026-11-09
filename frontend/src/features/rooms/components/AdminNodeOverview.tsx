import { ChevronRight, CircleDashed, CircleSlash, Lock, Wifi, WifiOff, Wrench } from 'lucide-react'
import { Link } from 'react-router'
import { useDevices } from '@/features/devices/hooks'
import type { DeviceItem } from '@/features/devices/schemas'
import { LifecyclePill } from '@/features/nodes/components/NodeBadges'
import { formatClock } from '@/shared/lib/datetime'
import { cn } from '@/shared/ui/cn'
import { DataState, EmptyState, Skeleton } from '@/shared/ui/DataState'
import { activityOf, type Activity } from '../activity'
import { useRooms } from '../hooks'
import { roomNumber } from '@/shared/lib/labels'

function nodeActivity(item: DeviceItem): Activity {
  return activityOf({
    lifecycle: item.lifecycle_status,
    online: item.online,
    lastSeenAt: item.device.last_seen_at,
  })
}

const activityStyle: Record<Activity, { label: string; icon: typeof Wifi; pill: string }> = {
  online: {
    label: 'Đang hoạt động',
    icon: Wifi,
    pill: 'bg-normal-wash text-normal-ink ring-normal/40',
  },
  offline: {
    label: 'Mất kết nối',
    icon: WifiOff,
    pill: 'bg-offline-wash text-offline-ink ring-offline/40',
  },
  never: {
    label: 'Chưa gửi dữ liệu',
    icon: CircleDashed,
    pill: 'bg-ground text-ink-soft ring-rule-strong',
  },
  blocked: { label: 'Tạm khoá', icon: Lock, pill: 'bg-board-100 text-board-900 ring-board-200' },
  maintenance: {
    label: 'Đang bảo trì',
    icon: Wrench,
    pill: 'bg-maintenance-wash text-maintenance-ink ring-maintenance/40',
  },
  retired: {
    label: 'Ngừng sử dụng',
    icon: CircleSlash,
    pill: 'bg-ground text-ink-faint ring-rule',
  },
}

/** Trạng thái do người quản lý đặt, tag vòng đời bên cạnh sẽ lặp lại nên ẩn đi. */
const MANAGED: ReadonlySet<Activity> = new Set(['blocked', 'maintenance', 'retired'])

/** "3 node · 1 đang hoạt động · 1 mất kết nối · 1 tạm khoá" */
function summary(items: DeviceItem[]): string {
  const parts = [`${items.length} node`]
  for (const a of Object.keys(activityStyle) as Activity[]) {
    const n = items.filter((i) => nodeActivity(i) === a).length
    if (n) parts.push(`${n} ${activityStyle[a].label.toLowerCase()}`)
  }
  return parts.join(' · ')
}

/**
 * Tổng quan của quản trị viên: chỉ cho biết node nào đang hoạt động.
 * Quản trị viên không xem số đo của phòng; số đo dành cho chủ trọ và người thuê.
 */
export function AdminNodeOverview({ now }: { now: Date }) {
  const devices = useDevices()
  const rooms = useRooms()
  const roomName = (id: string | null) =>
    id ? `Phòng ${roomNumber(rooms.data?.find((r) => r.id === id)?.name ?? id)}` : 'Chưa gán phòng'

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-col gap-1">
        <h1 className="text-xl font-bold tracking-tight">Tổng quan node</h1>
        <p className="text-sm text-ink-soft" aria-live="polite">
          {devices.data ? summary(devices.data) : 'Đang tải trạng thái node…'}
        </p>
      </header>

      <DataState
        query={devices}
        isEmpty={(items) => items.length === 0}
        skeleton={<Skeleton className="h-40" />}
        empty={
          <EmptyState title="Chưa có node nào">Đăng ký node ở mục Quản trị → Node.</EmptyState>
        }
      >
        {(items) => (
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {[...items]
              .sort((a, b) => a.device_id.localeCompare(b.device_id, 'vi', { numeric: true }))
              .map((item) => {
                const state = nodeActivity(item)
                const activity = activityStyle[state]
                const ActivityIcon = activity.icon
                const lastSeen = item.device.last_seen_at
                return (
                  <li key={item.device_id}>
                    <Link
                      to={`/quan-tri/node/${encodeURIComponent(item.device_id)}`}
                      className={cn(
                        'group flex flex-col gap-2.5 rounded-[var(--radius-sheet)] border p-3.5 hover:border-board-200 focus-visible:outline-2 focus-visible:outline-board-800',
                        state === 'offline'
                          ? 'border-offline/50 bg-offline-wash'
                          : 'border-rule bg-sheet',
                      )}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-xs text-ink-soft">Node</p>
                          <h2 className="tabular truncate text-base font-bold">{item.device_id}</h2>
                          <p className="truncate text-xs text-ink-soft">
                            {item.device.device_name} · {roomName(item.room_id)}
                          </p>
                        </div>
                        <ChevronRight
                          aria-hidden
                          className="mt-1 size-4 shrink-0 text-ink-faint group-hover:text-ink"
                        />
                      </div>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm">
                        <span
                          className={cn(
                            'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-sm leading-none font-semibold whitespace-nowrap ring-1 ring-inset',
                            activity.pill,
                          )}
                        >
                          <ActivityIcon aria-hidden className="size-4" />
                          {activity.label}
                        </span>
                        {!MANAGED.has(state) && <LifecyclePill lifecycle={item.lifecycle_status} />}
                      </div>
                      <p className="tabular text-xs text-ink-soft">
                        {lastSeen
                          ? `Nhận gần nhất ${formatClock(lastSeen, now)}`
                          : 'Chưa nhận dữ liệu'}
                      </p>
                    </Link>
                  </li>
                )
              })}
          </ul>
        )}
      </DataState>
    </div>
  )
}
