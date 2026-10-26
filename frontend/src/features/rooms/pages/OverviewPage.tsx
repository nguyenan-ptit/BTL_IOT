import { IncidentNotice } from '@/features/incidents/components/IncidentNotice'
import { useActiveIncidents } from '@/features/incidents/hooks'
import { useNow } from '@/shared/lib/useNow'
import { DataState, EmptyState, Skeleton } from '@/shared/ui/DataState'
import { RoomCard } from '../components/RoomCard'
import { useBoardingHouses, useRoomStatuses } from '../hooks'
import type { RoomOverall } from '@/shared/schemas/common'

const SUMMARY: [RoomOverall, string][] = [
  ['alarm', 'đang cảnh báo'],
  ['offline', 'mất kết nối'],
  ['sensor_fault', 'lỗi cảm biến'],
  ['maintenance', 'đang bảo trì'],
  ['normal', 'bình thường'],
  ['no_device', 'chưa có thiết bị'],
]

/** "3 phòng · 1 đang cảnh báo · 1 bình thường · 1 chưa có thiết bị". Không gộp thành "tất cả ổn". */
function summary(rooms: { overall: RoomOverall }[]): string {
  const parts = [`${rooms.length} phòng`]
  for (const [overall, label] of SUMMARY) {
    const n = rooms.filter((r) => r.overall === overall).length
    if (n) parts.push(`${n} ${label}`)
  }
  return parts.join(' · ')
}

/** Trang tổng quan (US1): trạng thái mới nhất của mọi phòng trong phạm vi người dùng. */
export default function OverviewPage() {
  const rooms = useRoomStatuses()
  const houses = useBoardingHouses()
  const active = useActiveIncidents()
  const now = useNow(1_000)
  const houseName = houses.data?.length === 1 ? houses.data[0]?.name : undefined

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight">{houseName ?? 'Tổng quan phòng'}</h1>
        <p className="text-sm text-ink-soft" aria-live="polite">
          {rooms.data ? summary(rooms.data) : 'Đang tải trạng thái phòng…'}
          <span className="hidden sm:inline"> · Tự cập nhật mỗi 3 giây</span>
        </p>
      </header>

      <DataState
        query={rooms}
        isEmpty={(data) => data.length === 0}
        skeleton={
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-52" />
            ))}
          </div>
        }
        empty={
          <EmptyState title="Chưa có phòng nào">
            Tài khoản của bạn chưa được gán phòng. Liên hệ quản trị viên để được gán.
          </EmptyState>
        }
      >
        {(data) => (
          <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {data.map(({ status, overall }) => (
              <li key={status.room.id} className="flex">
                <div className="flex-1">
                  <RoomCard
                    status={status}
                    overall={overall}
                    now={now}
                    notice={(() => {
                      const incident = active.data?.find((i) => i.id === status.activeIncidentId)
                      return incident ? <IncidentNotice incident={incident} now={now} /> : undefined
                    })()}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </DataState>
    </div>
  )
}
