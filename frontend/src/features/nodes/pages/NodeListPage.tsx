import { Plus } from 'lucide-react'
import { parseAsArrayOf, parseAsInteger, parseAsStringLiteral, useQueryStates } from 'nuqs'
import { useState } from 'react'
import { Link } from 'react-router'
import { useDevices } from '@/features/devices/hooks'
import { deviceLifecycleSchema, type DeviceLifecycle } from '@/features/devices/schemas'
import { useRooms } from '@/features/rooms/hooks'
import { formatClock } from '@/shared/lib/datetime'
import { Button } from '@/shared/ui/Button'
import { cn } from '@/shared/ui/cn'
import { DataState, EmptyState, Skeleton } from '@/shared/ui/DataState'
import { Sheet } from '@/shared/ui/Sheet'
import { NODE_PAGE_SIZE } from '../api'
import { ConnectivityText, LifecyclePill } from '../components/NodeBadges'
import { RegisterNodeForm } from '../components/RegisterNodeForm'
import { toNodeListItem } from '../schemas'
import { credentialLabel, deviceLifecycleLabel } from '../transitions'
import { roomNumber } from '@/shared/lib/labels'

function RegisterNodeSheet({ onDone }: { onDone: (registeredId?: string) => void }) {
  return (
    <Sheet className="flex flex-col gap-4 p-4 sm:p-5">
      <h2 className="text-lg font-bold">Đăng ký node mới</h2>
      <RegisterNodeForm onDone={onDone} />
    </Sheet>
  )
}

/** Quản lý node (US4, chỉ quản trị viên): danh sách có lọc trạng thái, đăng ký node mới. */
export default function NodeListPage() {
  const [filters, setFilters] = useQueryStates(
    {
      'trang-thai': parseAsArrayOf(parseAsStringLiteral(deviceLifecycleSchema.options)).withDefault(
        [],
      ),
      trang: parseAsInteger.withDefault(1),
    },
    { history: 'replace' },
  )
  const [adding, setAdding] = useState(false)
  const [registered, setRegistered] = useState<string | null>(null)
  const devices = useDevices({ refetchInterval: 10_000 })
  const rooms = useRooms()
  const roomNames = new Map(rooms.data?.map((r) => [r.id, r.name]))

  const toggle = (l: DeviceLifecycle) => {
    const cur = filters['trang-thai']
    void setFilters({
      'trang-thai': cur.includes(l) ? cur.filter((x) => x !== l) : [...cur, l],
      trang: 1,
    })
  }

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold tracking-tight">Quản lý node</h1>
        {!adding && (
          <Button onClick={() => setAdding(true)}>
            <Plus aria-hidden className="size-4" />
            Đăng ký node
          </Button>
        )}
      </header>

      {adding && (
        <RegisterNodeSheet
          onDone={(id) => {
            setAdding(false)
            setRegistered(id ?? null)
          }}
        />
      )}
      {registered && (
        <p
          role="status"
          className="rounded-[var(--radius-sheet)] border border-rule bg-sheet px-4 py-3 text-sm"
        >
          Đã đăng ký <span className="font-semibold">{registered}</span>, chờ xác nhận MQTT.{' '}
          <Link
            to={`/quan-tri/node/${encodeURIComponent(registered)}`}
            className="font-semibold text-board-900 underline"
          >
            Mở node để xác nhận
          </Link>
        </p>
      )}

      <div role="group" aria-label="Lọc theo trạng thái" className="flex flex-wrap gap-2">
        {deviceLifecycleSchema.options.map((l) => (
          <button
            key={l}
            type="button"
            aria-pressed={filters['trang-thai'].includes(l)}
            onClick={() => toggle(l)}
            className="h-10 rounded-full bg-sheet px-4 text-sm font-semibold ring-1 ring-rule-strong ring-inset hover:bg-board-100 aria-pressed:bg-board-900 aria-pressed:text-white aria-pressed:ring-board-900"
          >
            {deviceLifecycleLabel[l]}
          </button>
        ))}
      </div>

      <DataState
        query={devices}
        isEmpty={(items) => items.length === 0}
        skeleton={<Skeleton className="h-48" />}
        empty={
          <EmptyState title="Không có node nào">
            Bấm "Đăng ký node" để thêm thiết bị đầu tiên.
          </EmptyState>
        }
      >
        {(items) => {
          const chosen = filters['trang-thai']
          const rows = items
            .map((item) => toNodeListItem(item, roomNames))
            .filter((node) => chosen.length === 0 || chosen.includes(node.lifecycle))
          const pages = Math.max(1, Math.ceil(rows.length / NODE_PAGE_SIZE))
          const page = Math.min(filters.trang, pages)
          const shown = rows.slice((page - 1) * NODE_PAGE_SIZE, page * NODE_PAGE_SIZE)
          if (rows.length === 0) {
            return (
              <EmptyState title="Không có node nào">Không có node ở trạng thái đã chọn.</EmptyState>
            )
          }
          return (
            <div className="flex flex-col gap-3">
              <div className="overflow-x-auto rounded-[var(--radius-sheet)] border border-rule bg-sheet">
                <table className="w-full min-w-[48rem] text-sm">
                  <thead className="border-b border-rule bg-ground text-left text-ink-soft">
                    <tr>
                      <th scope="col" className="px-4 py-2.5 font-semibold">
                        Mã node
                      </th>
                      <th scope="col" className="px-4 py-2.5 font-semibold">
                        Phòng
                      </th>
                      <th scope="col" className="px-4 py-2.5 font-semibold">
                        Trạng thái
                      </th>
                      <th scope="col" className="px-4 py-2.5 font-semibold">
                        Tài khoản MQTT
                      </th>
                      <th scope="col" className="px-4 py-2.5 font-semibold">
                        Kết nối
                      </th>
                      <th scope="col" className="px-4 py-2.5 font-semibold">
                        Nhận gần nhất
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {shown.map((node) => (
                      <tr
                        key={node.id}
                        className="border-b border-rule last:border-0 hover:bg-board-100/50"
                      >
                        <td className="px-4 py-3">
                          <Link
                            to={`/quan-tri/node/${encodeURIComponent(node.id)}`}
                            className="tabular font-bold text-board-900 underline-offset-4 hover:underline"
                          >
                            {node.id}
                          </Link>
                          <span className="block text-xs text-ink-soft">{node.name}</span>
                        </td>
                        <td className="tabular px-4 py-3">
                          {node.roomName ? (
                            `Phòng ${roomNumber(node.roomName)}`
                          ) : (
                            <span className="text-ink-faint">Chưa gán</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <LifecyclePill lifecycle={node.lifecycle} />
                        </td>
                        <td className="px-4 py-3">{credentialLabel[node.credential]}</td>
                        <td className="px-4 py-3">
                          <ConnectivityText connectivity={node.connectivity} />
                        </td>
                        <td
                          className={cn(
                            'tabular px-4 py-3 whitespace-nowrap',
                            !node.lastSeenAt && 'text-ink-faint',
                          )}
                        >
                          {node.lastSeenAt ? formatClock(node.lastSeenAt) : 'Chưa có'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {pages > 1 && (
                <nav aria-label="Phân trang" className="flex items-center gap-2 text-sm">
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={page <= 1}
                    onClick={() => void setFilters({ trang: page - 1 })}
                  >
                    Trang trước
                  </Button>
                  <span className="tabular">
                    Trang {page}/{pages}
                  </span>
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={page >= pages}
                    onClick={() => void setFilters({ trang: page + 1 })}
                  >
                    Trang sau
                  </Button>
                </nav>
              )}
            </div>
          )
        }}
      </DataState>
    </div>
  )
}
