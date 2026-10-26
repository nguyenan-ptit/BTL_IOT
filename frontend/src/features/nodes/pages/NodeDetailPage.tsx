import { ArrowLeft } from 'lucide-react'
import { useState } from 'react'
import { Link, useParams } from 'react-router'
import { useRooms } from '@/features/rooms/hooks'
import { isApiError } from '@/shared/api/errors'
import { formatDateTime } from '@/shared/lib/datetime'
import { nodeLifecycleLabel } from '@/shared/lib/labels'
import { Button } from '@/shared/ui/Button'
import { ConfirmDialog } from '@/shared/ui/ConfirmDialog'
import { DataState, EmptyState, Skeleton } from '@/shared/ui/DataState'
import { inputClass } from '@/shared/ui/Field'
import { Sheet } from '@/shared/ui/Sheet'
import { ConnectivityText, LifecyclePill } from '../components/NodeBadges'
import { useAssignNode, useNode, useNodeHistory, useTransitionNode } from '../hooks'
import type { NodeAction, NodeHistoryEntry } from '../schemas'
import { allowedActions, nodeActionLabel } from '../transitions'

const errorText: Record<string, string> = {
  ROOM_HAS_ACTIVE_NODE: 'Phòng này đã có node khác đang sử dụng. Ngừng hoặc chuyển node đó trước.',
  NODE_NOT_ASSIGNED: 'Gán node vào một phòng trước khi kích hoạt.',
  INVALID_TRANSITION: 'Trạng thái node vừa thay đổi ở nơi khác. Trang đã được tải lại.',
  NODE_RETIRED: 'Node đã ngừng sử dụng nên không đổi được nữa.',
}

function describeError(error: unknown): string | null {
  if (!error) return null
  if (
    error instanceof Error &&
    'code' in error &&
    typeof error.code === 'string' &&
    errorText[error.code]
  ) {
    return errorText[error.code]!
  }
  return 'Chưa lưu được. Kiểm tra mạng rồi thử lại.'
}

function historyText(h: NodeHistoryEntry, roomName: (id: string | null) => string): string {
  if (h.kind === 'registered') return 'Đăng ký node'
  if (h.kind === 'assigned')
    return h.toRoomId ? `Gán vào ${roomName(h.toRoomId)}` : `Bỏ gán khỏi ${roomName(h.fromRoomId)}`
  return `${h.fromLifecycle ? nodeLifecycleLabel[h.fromLifecycle] : ''} → ${h.toLifecycle ? nodeLifecycleLabel[h.toLifecycle] : ''}`
}

/** Chi tiết node (US4): gán phòng, chuyển trạng thái hợp lệ, lịch sử. */
export default function NodeDetailPage() {
  const { id = '' } = useParams()
  const node = useNode(id)
  const historyQuery = useNodeHistory(id)
  const rooms = useRooms()
  const assign = useAssignNode(id)
  const transition = useTransitionNode(id)
  const [pending, setPending] = useState<NodeAction | null>(null)
  const [roomDraft, setRoomDraft] = useState<string | null>(null)

  const roomName = (roomId: string | null) =>
    roomId ? `phòng ${rooms.data?.find((r) => r.id === roomId)?.name ?? roomId}` : 'không phòng nào'

  if (isApiError(node.error, 'NOT_FOUND')) {
    return <EmptyState title="Không tìm thấy node">Node không tồn tại.</EmptyState>
  }

  return (
    <div className="flex flex-col gap-5">
      <Link
        to="/quan-tri/node"
        className="flex items-center gap-1 self-start text-sm font-semibold text-ink-soft hover:text-ink"
      >
        <ArrowLeft aria-hidden className="size-4" />
        Danh sách node
      </Link>

      <DataState query={node} skeleton={<Skeleton className="h-64" />} empty={null}>
        {(data) => {
          const actions = allowedActions(data.lifecycle)
          const retired = data.lifecycle === 'retired'
          const selectedRoom = roomDraft ?? data.roomId ?? ''
          return (
            <div className="flex flex-col gap-5">
              <header className="flex flex-wrap items-center gap-3">
                <h1 className="tabular text-2xl font-bold tracking-tight">{data.code}</h1>
                <LifecyclePill lifecycle={data.lifecycle} />
                {(data.lifecycle === 'active' || data.lifecycle === 'maintenance') && (
                  <ConnectivityText connectivity={data.connectivity} />
                )}
              </header>
              <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_24rem] lg:items-start">
                <div className="flex flex-col gap-5">
                  <Sheet className="flex flex-col gap-4 p-4 sm:p-5">
                    <h2 className="font-bold">Phòng</h2>
                    {retired ? (
                      <p className="text-ink-soft">
                        Node đã ngừng sử dụng, không đổi phòng được nữa.
                      </p>
                    ) : (
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                        <div className="flex flex-1 flex-col gap-1.5">
                          <label htmlFor="assign-room" className="text-sm font-semibold">
                            Gán vào phòng
                          </label>
                          <select
                            id="assign-room"
                            className={inputClass}
                            value={selectedRoom}
                            onChange={(e) => setRoomDraft(e.target.value)}
                          >
                            <option value="">Chưa gán</option>
                            {rooms.data?.map((room) => (
                              <option key={room.id} value={room.id}>
                                Phòng {room.name}
                              </option>
                            ))}
                          </select>
                        </div>
                        <Button
                          className="h-11"
                          variant="secondary"
                          disabled={selectedRoom === (data.roomId ?? '')}
                          loading={assign.isPending}
                          onClick={() =>
                            assign.mutate(selectedRoom || null, {
                              onSuccess: () => setRoomDraft(null),
                            })
                          }
                        >
                          Lưu phòng
                        </Button>
                      </div>
                    )}
                    {assign.error && (
                      <p role="alert" className="text-sm font-medium text-alarm-deep">
                        {describeError(assign.error)}
                      </p>
                    )}
                    <p className="text-sm text-ink-soft">
                      Nhận dữ liệu gần nhất:{' '}
                      {data.lastSeenAt ? formatDateTime(data.lastSeenAt) : 'chưa có'}
                    </p>
                  </Sheet>

                  <section aria-labelledby="node-history" className="flex flex-col gap-3">
                    <h2 id="node-history" className="text-lg font-bold">
                      Lịch sử
                    </h2>
                    <DataState
                      query={historyQuery}
                      isEmpty={(d) => d.length === 0}
                      skeleton={<Skeleton className="h-24" />}
                      empty={<EmptyState title="Chưa có lịch sử" />}
                    >
                      {(entries) => (
                        <ol className="flex flex-col divide-y divide-rule rounded-[var(--radius-sheet)] border border-rule bg-sheet">
                          {entries.map((h) => (
                            <li
                              key={h.id}
                              className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-4 py-3"
                            >
                              <span className="font-semibold">{historyText(h, roomName)}</span>
                              <span className="tabular text-sm text-ink-soft">
                                {h.actor.displayName} · {formatDateTime(h.at)}
                              </span>
                            </li>
                          ))}
                        </ol>
                      )}
                    </DataState>
                  </section>
                </div>

                <aside className="order-first lg:order-none">
                  <Sheet className="flex flex-col gap-3 p-4 sm:p-5">
                    <h2 className="font-bold">Trạng thái</h2>
                    {actions.length === 0 ? (
                      <p className="text-ink-soft">Node đã ngừng sử dụng. Chỉ còn xem lịch sử.</p>
                    ) : (
                      actions.map((action) => (
                        <Button
                          key={action}
                          variant={
                            action === 'retire'
                              ? 'danger'
                              : action === 'activate'
                                ? 'primary'
                                : 'secondary'
                          }
                          className="w-full"
                          onClick={() => {
                            transition.reset()
                            setPending(action)
                          }}
                        >
                          {nodeActionLabel[action]}
                        </Button>
                      ))
                    )}
                    {transition.error && (
                      <p role="alert" className="text-sm font-medium text-alarm-deep">
                        {describeError(transition.error)}
                      </p>
                    )}
                  </Sheet>
                </aside>

                <ConfirmDialog
                  open={pending !== null}
                  title={
                    pending === 'retire'
                      ? `Ngừng sử dụng ${data.code}?`
                      : pending
                        ? `${nodeActionLabel[pending]} ${data.code}?`
                        : ''
                  }
                  confirmLabel={pending ? nodeActionLabel[pending] : ''}
                  confirmVariant={pending === 'retire' ? 'danger' : 'primary'}
                  loading={transition.isPending}
                  onCancel={() => setPending(null)}
                  onConfirm={() =>
                    pending &&
                    transition.mutate(pending, {
                      onSettled: () => setPending(null),
                    })
                  }
                >
                  {pending === 'retire' && (
                    <p>
                      Thao tác này <strong className="text-ink">không hoàn tác được</strong>. Node
                      bị thu hồi quyền kết nối và không gửi dữ liệu được nữa. Lịch sử của node vẫn
                      được giữ.
                    </p>
                  )}
                  {pending === 'maintain' && (
                    <p>
                      Phòng sẽ hiện "Đang bảo trì" và không mở sự cố mới từ node này cho đến khi
                      kích hoạt lại.
                    </p>
                  )}
                  {pending === 'activate' && <p>Node bắt đầu theo dõi {roomName(data.roomId)}.</p>}
                </ConfirmDialog>
              </div>
            </div>
          )
        }}
      </DataState>
    </div>
  )
}
