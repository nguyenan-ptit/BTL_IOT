import { useState } from 'react'
import { currentThresholds, isWaiting } from '@/features/devices/adapters'
import { useDevices } from '@/features/devices/hooks'
import type { DeviceItem } from '@/features/devices/schemas'
import { LIVE_REFETCH_MS, useRooms } from '@/features/rooms/hooks'
import { DataState, EmptyState, Skeleton } from '@/shared/ui/DataState'
import { FormDialog } from '@/shared/ui/FormDialog'
import { DeviceControlCard } from '../components/DeviceControlCard'
import { ThresholdForm } from '../components/ThresholdForm'

/** Còn lệnh chờ ESP thì hỏi lại nhanh hơn để thấy kết quả sớm. */
function hasWaitingCommand(items: DeviceItem[] | undefined) {
  return (
    items?.some(
      (i) =>
        isWaiting(i.remote_control.pending?.status) || isWaiting(i.buzzer_control.pending?.status),
    ) ?? false
  )
}

/**
 * Ngưỡng cảnh báo (US7) theo từng node: xem ngưỡng node đang dùng, gửi ngưỡng mới, thử còi và đèn.
 * Backend không lưu ngưỡng riêng; ngưỡng hiển thị đọc từ telemetry mới nhất của node.
 */
export default function ThresholdsPage() {
  const devices = useDevices({
    refetchInterval: (items) => (hasWaitingCommand(items) ? 2_000 : LIVE_REFETCH_MS),
  })
  const rooms = useRooms()
  const [editing, setEditing] = useState<DeviceItem | null>(null)

  const roomName = (roomId: string | null) =>
    rooms.data?.find((r) => r.id === roomId)?.name ?? roomId ?? '—'

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight">Ngưỡng cảnh báo</h1>
        <p className="max-w-3xl text-sm text-ink-soft">
          Mỗi node có ngưỡng bật và tắt riêng. Cảnh báo bật khi số đo chạm ngưỡng bật và chỉ tắt khi
          xuống tới ngưỡng tắt. Gas là số ADC thô của MQ-2, không phải ppm. Ngưỡng mới chỉ có hiệu
          lực sau khi ESP xác nhận đã lưu.
        </p>
      </header>

      <DataState
        query={devices}
        isEmpty={(items) => items.every((i) => i.room_id === null)}
        skeleton={<Skeleton className="h-56" />}
        empty={
          <EmptyState title="Chưa có node nào">
            Các phòng của bạn chưa gắn node nên chưa có ngưỡng để chỉnh.
          </EmptyState>
        }
      >
        {(items) => (
          <ul className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {items
              .filter((i) => i.room_id !== null)
              .map((item) => (
                <DeviceControlCard
                  key={item.device_id}
                  item={item}
                  roomName={roomName(item.room_id)}
                  onEdit={() => setEditing(item)}
                />
              ))}
          </ul>
        )}
      </DataState>

      <FormDialog
        open={editing !== null}
        title={`Ngưỡng phòng ${editing ? roomName(editing.room_id) : ''}`}
        onClose={() => setEditing(null)}
      >
        {editing?.data && (
          <ThresholdForm
            key={editing.device_id}
            deviceId={editing.device_id}
            roomName={roomName(editing.room_id)}
            data={editing.data}
            initial={currentThresholds(editing.data)}
            onDone={() => setEditing(null)}
          />
        )}
      </FormDialog>
    </div>
  )
}
