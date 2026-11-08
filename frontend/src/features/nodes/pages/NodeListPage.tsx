import { zodResolver } from '@hookform/resolvers/zod'
import { Plus } from 'lucide-react'
import { parseAsArrayOf, parseAsInteger, parseAsStringLiteral, useQueryStates } from 'nuqs'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link } from 'react-router'
import { useDevices } from '@/features/devices/hooks'
import { deviceLifecycleSchema, type DeviceLifecycle } from '@/features/devices/schemas'
import { useRooms } from '@/features/rooms/hooks'
import { isApiError } from '@/shared/api/errors'
import { formatDateTime } from '@/shared/lib/datetime'
import { Button } from '@/shared/ui/Button'
import { cn } from '@/shared/ui/cn'
import { DataState, EmptyState, Skeleton } from '@/shared/ui/DataState'
import { Field, inputClass, TextInput } from '@/shared/ui/Field'
import { Sheet } from '@/shared/ui/Sheet'
import { NODE_PAGE_SIZE } from '../api'
import { ConnectivityText, LifecyclePill } from '../components/NodeBadges'
import { useRegisterNode } from '../hooks'
import {
  registerNodeFormSchema,
  toNodeListItem,
  type RegisterNodeBody,
  type RegisterNodeInput,
} from '../schemas'
import { credentialLabel, deviceLifecycleLabel } from '../transitions'

const EMPTY_FORM: RegisterNodeInput = {
  device_id: '',
  device_name: '',
  room_id: '',
  mqtt_username: '',
  mqtt_client_id: '',
  hardware_version: '',
  firmware_version: '',
}

function RegisterNodeSheet({ onDone }: { onDone: () => void }) {
  const rooms = useRooms()
  const register = useRegisterNode()
  const form = useForm<RegisterNodeInput, unknown, RegisterNodeBody>({
    resolver: zodResolver(registerNodeFormSchema),
    defaultValues: EMPTY_FORM,
  })
  const errors = form.formState.errors
  const text = (name: keyof RegisterNodeInput, label: string, hint?: string) => (
    <Field id={`node-${name}`} label={label} error={errors[name]?.message} hint={hint}>
      <TextInput
        id={`node-${name}`}
        spellCheck={false}
        autoCapitalize="none"
        aria-invalid={!!errors[name]}
        {...form.register(name)}
      />
    </Field>
  )

  return (
    <Sheet className="flex flex-col gap-4 p-4 sm:p-5">
      <h2 className="text-lg font-bold">Đăng ký node mới</h2>
      <p className="text-sm text-ink-soft">
        Đăng ký chỉ ghi node vào hệ thống. Sau đó cấp tài khoản MQTT ở trang chi tiết node, nạp vào
        ESP, rồi mới kích hoạt.
      </p>
      <form
        noValidate
        className="grid gap-4 sm:grid-cols-2"
        onSubmit={form.handleSubmit((body) =>
          register.mutate(body, {
            onSuccess: () => {
              form.reset(EMPTY_FORM)
              onDone()
            },
          }),
        )}
      >
        {text('device_id', 'Mã node', 'Giống device_id trong firmware, ví dụ node03.')}
        {text('device_name', 'Tên node')}
        <Field id="node-room_id" label="Phòng" error={errors.room_id?.message}>
          <select
            id="node-room_id"
            className={inputClass}
            aria-invalid={!!errors.room_id}
            {...form.register('room_id')}
          >
            <option value="">Chọn phòng</option>
            {rooms.data?.map((room) => (
              <option key={room.id} value={room.id}>
                Phòng {room.name}
              </option>
            ))}
          </select>
        </Field>
        {text('mqtt_username', 'Tên tài khoản MQTT (tham chiếu)')}
        {text('mqtt_client_id', 'MQTT Client ID (không bắt buộc)')}
        {text('hardware_version', 'Phiên bản phần cứng (không bắt buộc)')}
        {text('firmware_version', 'Phiên bản firmware (không bắt buộc)')}
        <div className="flex gap-2 sm:col-span-2">
          <Button type="submit" loading={register.isPending} className="h-11">
            Đăng ký
          </Button>
          <Button variant="ghost" className="h-11" onClick={onDone}>
            Hủy
          </Button>
        </div>
      </form>
      {register.error && (
        <p role="alert" className="text-sm font-medium text-alarm-deep">
          {isApiError(register.error)
            ? register.error.message
            : 'Chưa đăng ký được. Kiểm tra mạng rồi thử lại.'}
        </p>
      )}
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

      {adding && <RegisterNodeSheet onDone={() => setAdding(false)} />}

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
                            `Phòng ${node.roomName}`
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
                          {node.lastSeenAt ? formatDateTime(node.lastSeenAt) : 'Chưa có'}
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
