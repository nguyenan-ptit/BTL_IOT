import { CircleCheck, Clock3, Info, RotateCcw, SlidersHorizontal, WifiOff } from 'lucide-react'
import { useState } from 'react'
import { formatDateTime } from '@/shared/lib/datetime'
import { formatInteger, formatTemperature } from '@/shared/lib/number'
import { Button } from '@/shared/ui/Button'
import { cn } from '@/shared/ui/cn'
import { ConfirmDialog } from '@/shared/ui/ConfirmDialog'
import { DataState, EmptyState, Skeleton } from '@/shared/ui/DataState'
import { FormDialog } from '@/shared/ui/FormDialog'
import { useDefaultThresholds, useResetThresholds, useThresholds } from '../api'
import { ThresholdForm } from '../components/ThresholdForm'
import { sameValues, type RoomThreshold, type SyncState, type ThresholdValues } from '../schemas'

const USE_MOCK = import.meta.env.VITE_USE_MOCK === 'true'

const syncStyle: Record<SyncState, { label: string; icon: typeof CircleCheck; className: string }> =
  {
    applied: {
      label: 'Đang áp dụng',
      icon: CircleCheck,
      className: 'bg-normal-wash text-normal-ink ring-normal/40',
    },
    pending: {
      label: 'Chờ node áp dụng',
      icon: Clock3,
      className: 'bg-board-100 text-board-900 ring-board-200',
    },
    unreachable: {
      label: 'Node không phản hồi',
      icon: WifiOff,
      className: 'bg-offline-wash text-offline-ink ring-offline/40',
    },
  }

function SyncPill({ sync }: { sync: SyncState }) {
  const { label, icon: Icon, className } = syncStyle[sync]
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-sm leading-none font-semibold whitespace-nowrap ring-1 ring-inset',
        className,
      )}
    >
      <Icon aria-hidden className="size-4" />
      {label}
    </span>
  )
}

function Pair({ label, on, off }: { label: string; on: string; off: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs font-semibold text-ink-soft">{label}</dt>
      <dd className="tabular font-bold">
        bật {on} <span className="font-normal text-ink-soft">· tắt {off}</span>
      </dd>
    </div>
  )
}

function Values({ v }: { v: ThresholdValues }) {
  return (
    <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <Pair label="Gas/khói (ADC)" on={formatInteger(v.gasOn)} off={formatInteger(v.gasOff)} />
      <Pair label="Nhiệt độ" on={formatTemperature(v.tempOn)} off={formatTemperature(v.tempOff)} />
    </dl>
  )
}

type Editing = { roomIds: string[]; roomNames: string[]; initial: ThresholdValues }

/** Ngưỡng cảnh báo (US7): chủ trọ cho phòng thuộc nhà trọ mình, quản trị viên cho mọi phòng. */
export default function ThresholdsPage() {
  const thresholds = useThresholds()
  const defaults = useDefaultThresholds()
  const reset = useResetThresholds()
  const [selected, setSelected] = useState<string[]>([])
  const [editing, setEditing] = useState<Editing | null>(null)
  const [resetting, setResetting] = useState<RoomThreshold[] | null>(null)

  const toggle = (id: string) =>
    setSelected((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]))

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight">Ngưỡng cảnh báo</h1>
        <p className="max-w-3xl text-sm text-ink-soft">
          Mỗi phòng có ngưỡng bật và tắt riêng. Cảnh báo bật khi số đo chạm ngưỡng bật và chỉ tắt
          khi xuống tới ngưỡng tắt, để không bật tắt liên tục. Gas là số ADC thô của MQ-2, không
          phải ppm.
        </p>
      </header>

      {USE_MOCK && (
        <p className="flex max-w-3xl items-start gap-2 rounded-[var(--radius-sheet)] border border-rule bg-sheet px-3 py-2.5 text-sm text-ink-soft">
          <Info aria-hidden className="mt-0.5 size-4 shrink-0 text-board-800" />
          Dữ liệu giả lập: node được coi như nhận ngưỡng mới sau khoảng 4 giây. Firmware V6 thật
          chưa nhận lệnh từ xa, nên khi nối thật trạng thái sẽ dừng ở "Chờ node áp dụng" cho tới khi
          nhóm làm xong phần lệnh.
        </p>
      )}

      <DataState
        query={thresholds}
        isEmpty={(d) => d.length === 0}
        skeleton={<Skeleton className="h-56" />}
        empty={
          <EmptyState title="Chưa có phòng nào">Tài khoản của bạn chưa được gán phòng.</EmptyState>
        }
      >
        {(rooms) => {
          const chosen = rooms.filter((r) => selected.includes(r.roomId))
          return (
            <div className="flex flex-col gap-3">
              <div className="flex flex-wrap items-center gap-3">
                <label className="flex items-center gap-2 text-sm font-semibold">
                  <input
                    type="checkbox"
                    className="size-5 accent-board-900"
                    checked={chosen.length === rooms.length}
                    onChange={(e) =>
                      setSelected(e.target.checked ? rooms.map((r) => r.roomId) : [])
                    }
                  />
                  Chọn tất cả
                </label>
                {chosen.length > 0 && (
                  <>
                    <Button
                      size="sm"
                      onClick={() =>
                        setEditing({
                          roomIds: chosen.map((r) => r.roomId),
                          roomNames: chosen.map((r) => r.roomName),
                          initial: chosen[0]!.desired,
                        })
                      }
                    >
                      <SlidersHorizontal aria-hidden className="size-4" />
                      Đặt ngưỡng cho {chosen.length} phòng
                    </Button>
                    <Button size="sm" variant="secondary" onClick={() => setResetting(chosen)}>
                      <RotateCcw aria-hidden className="size-4" />
                      Khôi phục mặc định
                    </Button>
                  </>
                )}
              </div>

              <ul className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                {rooms.map((r) => {
                  const isDefault = defaults.data ? sameValues(r.desired, defaults.data) : true
                  const differs = r.reported && !sameValues(r.desired, r.reported)
                  return (
                    <li
                      key={r.roomId}
                      className="flex flex-col gap-4 rounded-[var(--radius-sheet)] border border-rule bg-sheet p-4"
                    >
                      <div className="flex flex-wrap items-center gap-3">
                        <input
                          type="checkbox"
                          aria-label={`Chọn phòng ${r.roomName}`}
                          className="size-5 accent-board-900"
                          checked={selected.includes(r.roomId)}
                          onChange={() => toggle(r.roomId)}
                        />
                        <h2 className="tabular text-xl font-bold">Phòng {r.roomName}</h2>
                        <span className="ml-auto">
                          {r.reported ? (
                            <SyncPill sync={r.sync} />
                          ) : (
                            <span className="inline-flex items-center rounded-full bg-ground px-2.5 py-1 text-sm leading-none font-semibold whitespace-nowrap text-ink-soft ring-1 ring-rule-strong ring-inset">
                              Chưa có node
                            </span>
                          )}
                        </span>
                      </div>

                      {differs && (
                        <p className="-mb-2 text-xs font-semibold text-ink-soft">Đã đặt</p>
                      )}
                      <Values v={r.desired} />

                      {differs && r.reported && (
                        <div className="rounded-[4px] bg-ground px-3 py-2">
                          <p className="mb-2 text-xs font-semibold text-ink-soft">Node đang dùng</p>
                          <Values v={r.reported} />
                        </div>
                      )}
                      {!r.reported && (
                        <p className="text-sm text-ink-soft">
                          Phòng chưa có node nên chưa có ngưỡng nào được áp dụng.
                        </p>
                      )}

                      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-rule pt-3">
                        <p className="text-xs text-ink-soft">
                          {r.updatedBy && r.updatedAt
                            ? `Sửa gần nhất: ${r.updatedBy.displayName}, ${formatDateTime(r.updatedAt)}`
                            : 'Đang dùng ngưỡng mặc định'}
                        </p>
                        <div className="flex gap-1">
                          {!isDefault && (
                            <Button variant="ghost" size="sm" onClick={() => setResetting([r])}>
                              <RotateCcw aria-hidden className="size-4" />
                              Mặc định
                            </Button>
                          )}
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() =>
                              setEditing({
                                roomIds: [r.roomId],
                                roomNames: [r.roomName],
                                initial: r.desired,
                              })
                            }
                          >
                            Sửa ngưỡng
                          </Button>
                        </div>
                      </div>
                    </li>
                  )
                })}
              </ul>
            </div>
          )
        }}
      </DataState>

      <FormDialog
        open={editing !== null}
        title={
          editing && editing.roomIds.length > 1
            ? 'Đặt ngưỡng cho nhiều phòng'
            : `Ngưỡng phòng ${editing?.roomNames[0] ?? ''}`
        }
        onClose={() => setEditing(null)}
      >
        {editing && (
          <ThresholdForm
            key={editing.roomIds.join(',')}
            roomIds={editing.roomIds}
            roomNames={editing.roomNames}
            initial={editing.initial}
            defaults={defaults.data}
            onDone={() => {
              setEditing(null)
              setSelected([])
            }}
          />
        )}
      </FormDialog>

      <ConfirmDialog
        open={resetting !== null}
        title={`Khôi phục ngưỡng mặc định cho ${resetting?.map((r) => `phòng ${r.roomName}`).join(', ') ?? ''}?`}
        confirmLabel="Khôi phục"
        loading={reset.isPending}
        onCancel={() => setResetting(null)}
        onConfirm={() =>
          resetting &&
          reset.mutate(
            resetting.map((r) => r.roomId),
            {
              onSettled: () => {
                setResetting(null)
                setSelected([])
              },
            },
          )
        }
      >
        {defaults.data && (
          <p>
            Gas bật {formatInteger(defaults.data.gasOn)}, tắt {formatInteger(defaults.data.gasOff)};
            nhiệt độ bật {formatTemperature(defaults.data.tempOn)}, tắt{' '}
            {formatTemperature(defaults.data.tempOff)}.
          </p>
        )}
      </ConfirmDialog>
    </div>
  )
}
