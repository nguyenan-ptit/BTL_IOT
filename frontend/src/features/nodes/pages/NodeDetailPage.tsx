import { ArrowLeft } from 'lucide-react'
import { useState } from 'react'
import { Link, useParams } from 'react-router'
import { useDevices } from '@/features/devices/hooks'
import { commandStatusLabel } from '@/features/devices/labels'
import {
  commandStatusSchema,
  type CommandStatus,
  type DeviceLifecycle,
} from '@/features/devices/schemas'
import { useRoomLabels } from '@/features/rooms/hooks'
import { isApiError } from '@/shared/api/errors'
import { formatClock, formatDateTime } from '@/shared/lib/datetime'
import { Button } from '@/shared/ui/Button'
import { ConfirmDialog } from '@/shared/ui/ConfirmDialog'
import { DataState, EmptyState, Skeleton } from '@/shared/ui/DataState'
import { inputClass } from '@/shared/ui/Field'
import { Sheet } from '@/shared/ui/Sheet'
import { AttachMqttPanel } from '../components/AttachMqttPanel'
import { ConnectivityText, LifecyclePill } from '../components/NodeBadges'
import { useChangeLifecycle, useMoveNode, useNodeCommands } from '../hooks'
import { canAttachExistingMqtt, maintenanceNoteSchema, toNodeListItem } from '../schemas'
import {
  allowedTargets,
  credentialLabel,
  deviceLifecycleLabel,
  mqttSyncLabel,
  transitionLabel,
} from '../transitions'
import { RoomOptions } from '@/features/rooms/components/RoomOptions'

function errorText(error: unknown): string {
  return isApiError(error) ? error.message : 'Chưa lưu được. Kiểm tra mạng rồi thử lại.'
}

/** Kết quả của PATCH /lifecycle khi chạy luồng thu hồi MQTT (ngừng sử dụng). */
function operationNotice(result: unknown): string | null {
  if (result && typeof result === 'object' && 'operation_id' in result && 'message' in result) {
    return String(result.message)
  }
  return null
}

/** Chi tiết node (US4): đổi phòng, chuyển vòng đời theo backend, lịch sử lệnh. */
export default function NodeDetailPage() {
  const { id = '' } = useParams()
  const devices = useDevices({ refetchInterval: 5_000 })
  const commands = useNodeCommands(id)
  const move = useMoveNode(id)
  const lifecycle = useChangeLifecycle(id)
  const [target, setTarget] = useState<DeviceLifecycle | null>(null)
  const [note, setNote] = useState('')
  const [noteError, setNoteError] = useState<string | null>(null)
  const [roomDraft, setRoomDraft] = useState<string | null>(null)

  const roomLabels = useRoomLabels()
  const roomNames = roomLabels.labels
  const item = devices.data?.find((d) => d.device_id === id)
  const notice = operationNotice(lifecycle.data)

  if (devices.isSuccess && !item) {
    return (
      <EmptyState title="Không tìm thấy node">
        Node không tồn tại hoặc ngoài phạm vi của bạn.
      </EmptyState>
    )
  }

  const confirm = () => {
    if (!target) return
    let maintenance_note: string | undefined
    if (target === 'maintenance') {
      const parsed = maintenanceNoteSchema.safeParse(note)
      if (!parsed.success) {
        setNoteError(parsed.error.issues[0]?.message ?? 'Ghi chú không hợp lệ.')
        return
      }
      maintenance_note = parsed.data || undefined
    }
    lifecycle.mutate(
      { lifecycle_status: target, maintenance_note },
      { onSettled: () => setTarget(null) },
    )
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

      <DataState query={devices} skeleton={<Skeleton className="h-64" />} empty={null}>
        {() => {
          if (!item) return null
          const node = toNodeListItem(item, roomNames)
          const targets = allowedTargets(node.lifecycle)
          const retired = node.lifecycle === 'decommissioned'
          const selectedRoom = roomDraft ?? node.roomId ?? ''
          return (
            <div className="flex flex-col gap-5">
              <header className="flex flex-wrap items-center gap-3">
                <h1 className="tabular text-2xl font-bold tracking-tight">{node.id}</h1>
                <span className="text-ink-soft">{node.name}</span>
                <LifecyclePill lifecycle={node.lifecycle} />
                <ConnectivityText connectivity={node.connectivity} />
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
                          <label htmlFor="move-room" className="text-sm font-semibold">
                            Chuyển sang phòng
                          </label>
                          <select
                            id="move-room"
                            className={inputClass}
                            value={selectedRoom}
                            onChange={(e) => setRoomDraft(e.target.value)}
                          >
                            {!node.roomId && <option value="">Chưa gán</option>}
                            <RoomOptions groups={roomLabels.groups} />
                          </select>
                        </div>
                        <Button
                          className="h-11"
                          variant="secondary"
                          disabled={!selectedRoom || selectedRoom === (node.roomId ?? '')}
                          loading={move.isPending}
                          onClick={() =>
                            move.mutate(selectedRoom, { onSuccess: () => setRoomDraft(null) })
                          }
                        >
                          Lưu phòng
                        </Button>
                      </div>
                    )}
                    {move.error && (
                      <p role="alert" className="text-sm font-medium text-alarm-deep">
                        {errorText(move.error)}
                      </p>
                    )}
                    <p className="text-sm text-ink-soft">
                      Nhận dữ liệu gần nhất:{' '}
                      {node.lastSeenAt ? formatClock(node.lastSeenAt) : 'chưa có'}
                    </p>
                    {node.lifecycle === 'maintenance' && node.maintenanceNote && (
                      <p className="text-sm">Ghi chú bảo trì: {node.maintenanceNote}</p>
                    )}
                  </Sheet>

                  <Sheet className="flex flex-col gap-3 p-4 sm:p-5">
                    <h2 className="font-bold">Thông tin node</h2>
                    <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
                      {[
                        ['Mã node', item.device.device_id],
                        ['Tên node', item.device.device_name],
                        ['Phòng', roomLabels.label(node.roomId)],
                        ['MQTT username', item.device.mqtt_username],
                        ['MQTT Client ID', item.device.mqtt_client_id],
                        ['Loại bo mạch', item.device.board_model],
                        ['Phiên bản phần cứng', item.device.hardware_version],
                        ['Phiên bản firmware', item.device.firmware_version],
                      ].map(([label, value]) => (
                        <div key={label} className="flex min-w-0 flex-col gap-0.5">
                          <dt className="text-sm text-ink-soft">{label}</dt>
                          <dd className="tabular font-semibold break-all">{value || '—'}</dd>
                        </div>
                      ))}
                    </dl>
                  </Sheet>

                  <section aria-labelledby="node-commands" className="flex flex-col gap-3">
                    <h2 id="node-commands" className="text-lg font-bold">
                      Lịch sử lệnh điều khiển
                    </h2>
                    <DataState
                      query={commands}
                      isEmpty={(d) => d.length === 0}
                      skeleton={<Skeleton className="h-24" />}
                      empty={<EmptyState title="Chưa có lệnh nào" />}
                    >
                      {(rows) => (
                        <ol className="flex flex-col divide-y divide-rule rounded-[var(--radius-sheet)] border border-rule bg-sheet">
                          {rows.map((c) => (
                            <li
                              key={c.request_id}
                              className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-4 py-3"
                            >
                              <span className="font-semibold">
                                {c.command_type === 'thresholds' ? 'Đổi ngưỡng' : 'Thử còi và đèn'}
                                {' · '}
                                {commandStatusSchema.safeParse(c.status).success
                                  ? commandStatusLabel[c.status as CommandStatus]
                                  : c.status}
                              </span>
                              <span className="tabular text-sm text-ink-soft">
                                {formatDateTime(c.requested_at)}
                              </span>
                              {c.error_message && (
                                <span className="w-full text-sm text-ink-soft">
                                  {c.error_message}
                                </span>
                              )}
                            </li>
                          ))}
                        </ol>
                      )}
                    </DataState>
                  </section>
                </div>

                <aside className="order-first flex flex-col gap-5 lg:order-none">
                  <Sheet className="flex flex-col gap-3 p-4 sm:p-5">
                    <h2 className="font-bold">Vòng đời</h2>
                    {/* Ba trạng thái độc lập của backend, không gộp thành một. */}
                    <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
                      <dt className="text-ink-soft">Vòng đời</dt>
                      <dd className="font-semibold">{deviceLifecycleLabel[node.lifecycle]}</dd>
                      <dt className="text-ink-soft">Tài khoản MQTT</dt>
                      <dd className="font-semibold">{credentialLabel[node.credential]}</dd>
                      <dt className="text-ink-soft">Đồng bộ MQTT</dt>
                      <dd className="font-semibold">{mqttSyncLabel[node.mqttSync]}</dd>
                    </dl>
                    {targets.length === 0 ? (
                      <p className="text-ink-soft">
                        {retired
                          ? 'Node đã ngừng sử dụng. Chỉ còn xem lịch sử.'
                          : 'Xác nhận tài khoản MQTT trước khi kích hoạt.'}
                      </p>
                    ) : (
                      targets.map((t) => (
                        <Button
                          key={t}
                          variant={
                            t === 'decommissioned' || t === 'blocked'
                              ? 'danger'
                              : t === 'active'
                                ? 'primary'
                                : 'secondary'
                          }
                          className="w-full"
                          onClick={() => {
                            lifecycle.reset()
                            setNote(node.maintenanceNote ?? '')
                            setNoteError(null)
                            setTarget(t)
                          }}
                        >
                          {transitionLabel[t]}
                        </Button>
                      ))
                    )}
                    {node.lifecycle === 'registered' && (
                      <p className="text-sm text-ink-soft">
                        Đã đăng ký, chờ xác nhận MQTT. Xác nhận ở ô bên dưới, sau đó node chuyển
                        sang chờ kích hoạt.
                      </p>
                    )}
                    {node.lifecycle === 'provisioned' && (
                      <p className="text-sm text-ink-soft">
                        Đã xác nhận MQTT, chờ kích hoạt. Kích hoạt xong node mới được nhận số đo;
                        online hay không vẫn theo dõi riêng.
                      </p>
                    )}
                    {lifecycle.error && (
                      <p role="alert" className="text-sm font-medium text-alarm-deep">
                        {errorText(lifecycle.error)}
                      </p>
                    )}
                    {notice && (
                      <p role="status" className="text-sm font-medium">
                        {notice}
                      </p>
                    )}
                  </Sheet>
                  {canAttachExistingMqtt(node) && (
                    <AttachMqttPanel nodeId={node.id} username={item.device.mqtt_username} />
                  )}
                </aside>
              </div>

              <ConfirmDialog
                open={target !== null}
                title={target ? `${transitionLabel[target]} ${node.id}?` : ''}
                confirmLabel={target ? transitionLabel[target] : ''}
                confirmVariant={
                  target === 'decommissioned' || target === 'blocked' ? 'danger' : 'primary'
                }
                loading={lifecycle.isPending}
                onCancel={() => setTarget(null)}
                onConfirm={confirm}
              >
                {target === 'decommissioned' && (
                  <p>
                    Thao tác này <strong className="text-ink">không hoàn tác được</strong>. Hệ thống
                    thu hồi tài khoản MQTT của node; nếu EMQX chưa xử lý xong, node vẫn bị chặn ở
                    backend. Lịch sử vẫn được giữ.
                  </p>
                )}
                {target === 'blocked' && (
                  <p>
                    Backend ngừng ghi số đo và chặn lệnh mới từ node. Tài khoản MQTT được giữ nên có
                    thể mở lại sau.
                  </p>
                )}
                {target === 'maintenance' && (
                  <div className="flex flex-col gap-1.5">
                    <label htmlFor="maintenance-note" className="text-sm font-semibold text-ink">
                      Ghi chú bảo trì (không bắt buộc)
                    </label>
                    <textarea
                      id="maintenance-note"
                      rows={3}
                      className={inputClass}
                      value={note}
                      aria-invalid={!!noteError}
                      onChange={(e) => {
                        setNote(e.target.value)
                        setNoteError(null)
                      }}
                    />
                    {noteError && <p className="text-sm text-alarm-deep">{noteError}</p>}
                  </div>
                )}
                {target === 'active' && <p>Node được nhận số đo và lệnh điều khiển trở lại.</p>}
              </ConfirmDialog>
            </div>
          )
        }}
      </DataState>
    </div>
  )
}
