import { zodResolver } from '@hookform/resolvers/zod'
import { Plus } from 'lucide-react'
import { parseAsArrayOf, parseAsInteger, parseAsStringLiteral, useQueryStates } from 'nuqs'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link } from 'react-router'
import { useRooms } from '@/features/rooms/hooks'
import { isApiError } from '@/shared/api/errors'
import { formatDateTime } from '@/shared/lib/datetime'
import { nodeLifecycleLabel } from '@/shared/lib/labels'
import { nodeLifecycleSchema, type NodeLifecycle } from '@/shared/schemas/common'
import { Button } from '@/shared/ui/Button'
import { cn } from '@/shared/ui/cn'
import { DataState, EmptyState, Skeleton } from '@/shared/ui/DataState'
import { Field, inputClass, TextInput } from '@/shared/ui/Field'
import { Sheet } from '@/shared/ui/Sheet'
import { ConnectivityText, LifecyclePill } from '../components/NodeBadges'
import { useNodes, useRegisterNode } from '../hooks'
import { registerNodeFormSchema, type RegisterNodeForm } from '../schemas'

function RegisterNodeSheet({ onDone }: { onDone: () => void }) {
  const rooms = useRooms()
  const register = useRegisterNode()
  const form = useForm<RegisterNodeForm>({
    resolver: zodResolver(registerNodeFormSchema),
    defaultValues: { code: '', roomId: '' },
  })
  const codeError =
    form.formState.errors.code?.message ??
    (isApiError(register.error, 'NODE_CODE_TAKEN')
      ? 'Mã node này đã có trong hệ thống.'
      : undefined)

  return (
    <Sheet className="flex flex-col gap-4 p-4 sm:p-5">
      <h2 className="text-lg font-bold">Đăng ký node mới</h2>
      <form
        noValidate
        className="grid gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-start"
        onSubmit={form.handleSubmit((values) =>
          register.mutate(
            { code: values.code, roomId: values.roomId || null },
            {
              onSuccess: () => {
                form.reset()
                onDone()
              },
            },
          ),
        )}
      >
        <Field
          id="node-code"
          label="Mã node"
          error={codeError}
          hint="In trên nhãn của thiết bị, ví dụ NODE-103."
        >
          <TextInput
            id="node-code"
            autoCapitalize="characters"
            spellCheck={false}
            aria-invalid={!!codeError}
            {...form.register('code')}
          />
        </Field>
        <Field id="node-room" label="Gán vào phòng (không bắt buộc)">
          <select id="node-room" className={inputClass} {...form.register('roomId')}>
            <option value="">Chưa gán</option>
            {rooms.data?.map((room) => (
              <option key={room.id} value={room.id}>
                Phòng {room.name}
              </option>
            ))}
          </select>
        </Field>
        <div className="flex gap-2 sm:pt-[1.625rem]">
          <Button type="submit" loading={register.isPending} className="h-11">
            Đăng ký
          </Button>
          <Button variant="ghost" className="h-11" onClick={onDone}>
            Hủy
          </Button>
        </div>
      </form>
      {register.error && !isApiError(register.error, 'NODE_CODE_TAKEN') && (
        <p role="alert" className="text-sm font-medium text-alarm-deep">
          Chưa đăng ký được. Kiểm tra mạng rồi thử lại.
        </p>
      )}
    </Sheet>
  )
}

/** Quản lý node (US4, chỉ quản trị viên): danh sách có lọc trạng thái, đăng ký node mới. */
export default function NodeListPage() {
  const [filters, setFilters] = useQueryStates(
    {
      'trang-thai': parseAsArrayOf(parseAsStringLiteral(nodeLifecycleSchema.options)).withDefault(
        [],
      ),
      trang: parseAsInteger.withDefault(1),
    },
    { history: 'replace' },
  )
  const [adding, setAdding] = useState(false)
  const nodes = useNodes(filters['trang-thai'], filters.trang)

  const toggle = (l: NodeLifecycle) => {
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
        {nodeLifecycleSchema.options.map((l) => (
          <button
            key={l}
            type="button"
            aria-pressed={filters['trang-thai'].includes(l)}
            onClick={() => toggle(l)}
            className="h-10 rounded-full bg-sheet px-4 text-sm font-semibold ring-1 ring-rule-strong ring-inset hover:bg-board-100 aria-pressed:bg-board-900 aria-pressed:text-white aria-pressed:ring-board-900"
          >
            {nodeLifecycleLabel[l]}
          </button>
        ))}
      </div>

      <DataState
        query={nodes}
        isEmpty={(d) => d.items.length === 0}
        skeleton={<Skeleton className="h-48" />}
        empty={
          <EmptyState title="Không có node nào">
            {filters['trang-thai'].length
              ? 'Không có node ở trạng thái đã chọn.'
              : 'Bấm "Đăng ký node" để thêm thiết bị đầu tiên.'}
          </EmptyState>
        }
      >
        {(page) => (
          <div className="overflow-x-auto rounded-[var(--radius-sheet)] border border-rule bg-sheet">
            <table className="w-full min-w-[40rem] text-sm">
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
                    Kết nối
                  </th>
                  <th scope="col" className="px-4 py-2.5 font-semibold">
                    Nhận gần nhất
                  </th>
                </tr>
              </thead>
              <tbody>
                {page.items.map((node) => (
                  <tr
                    key={node.id}
                    className="border-b border-rule last:border-0 hover:bg-board-100/50"
                  >
                    <td className="px-4 py-3">
                      <Link
                        to={`/quan-tri/node/${node.id}`}
                        className="tabular font-bold text-board-900 underline-offset-4 hover:underline"
                      >
                        {node.code}
                      </Link>
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
                    <td className="px-4 py-3">
                      {node.lifecycle === 'retired' || node.lifecycle === 'registered' ? (
                        <span className="text-ink-faint">—</span>
                      ) : (
                        <ConnectivityText connectivity={node.connectivity} />
                      )}
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
        )}
      </DataState>
    </div>
  )
}
