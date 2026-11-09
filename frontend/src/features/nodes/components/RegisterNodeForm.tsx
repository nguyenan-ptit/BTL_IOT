import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { useRooms } from '@/features/rooms/hooks'
import { isApiError } from '@/shared/api/errors'
import { roomNumber } from '@/shared/lib/labels'
import { Button } from '@/shared/ui/Button'
import { Field, inputClass, TextInput } from '@/shared/ui/Field'
import { useRegisterNode } from '../hooks'
import { registerNodeFormSchema, type RegisterNodeBody, type RegisterNodeInput } from '../schemas'

const EMPTY_FORM: RegisterNodeInput = {
  device_id: '',
  device_name: '',
  room_id: '',
  mqtt_username: '',
  mqtt_client_id: '',
  hardware_version: '',
  firmware_version: '',
}

/**
 * Form đăng ký node (POST /api/devices/register). `presetRoomId` dùng khi thêm node từ một phòng:
 * ô phòng được chọn sẵn và khoá lại.
 */
export function RegisterNodeForm({
  presetRoomId,
  onDone,
}: {
  presetRoomId?: string
  onDone: () => void
}) {
  const rooms = useRooms()
  const register = useRegisterNode()
  const initial = { ...EMPTY_FORM, room_id: presetRoomId ?? '' }
  const form = useForm<RegisterNodeInput, unknown, RegisterNodeBody>({
    resolver: zodResolver(registerNodeFormSchema),
    defaultValues: initial,
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
    <form
      noValidate
      className="grid gap-4 sm:grid-cols-2"
      onSubmit={form.handleSubmit((body) =>
        register.mutate(body, {
          onSuccess: () => {
            form.reset(initial)
            onDone()
          },
        }),
      )}
    >
      <p className="text-sm text-ink-soft sm:col-span-2">
        Đăng ký chỉ ghi node vào hệ thống. Node cần được cấp tài khoản MQTT và nạp vào ESP rồi mới
        kích hoạt được.
      </p>
      {text('device_id', 'Mã node', 'Giống device_id trong firmware, ví dụ node03.')}
      {text('device_name', 'Tên node')}
      {presetRoomId ? (
        <Field id="node-room-fixed" label="Phòng">
          {/* Phòng chọn sẵn: hiện tên ở ô chỉ đọc, giá trị gửi đi nằm ở ô ẩn. */}
          <TextInput
            id="node-room-fixed"
            readOnly
            value={`Phòng ${roomNumber(rooms.data?.find((r) => r.id === presetRoomId)?.name ?? presetRoomId)}`}
          />
          <input type="hidden" {...form.register('room_id')} />
        </Field>
      ) : (
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
                Phòng {roomNumber(room.name)}
              </option>
            ))}
          </select>
        </Field>
      )}
      {text('mqtt_username', 'Tên tài khoản MQTT (tham chiếu)')}
      {text('mqtt_client_id', 'MQTT Client ID (không bắt buộc)')}
      {text('hardware_version', 'Phiên bản phần cứng (không bắt buộc)')}
      {text('firmware_version', 'Phiên bản firmware (không bắt buộc)')}
      {register.error && (
        <p role="alert" className="text-sm font-medium text-alarm-deep sm:col-span-2">
          {isApiError(register.error)
            ? register.error.message
            : 'Chưa đăng ký được. Kiểm tra mạng rồi thử lại.'}
        </p>
      )}
      <div className="flex gap-2 sm:col-span-2">
        <Button type="submit" loading={register.isPending} className="h-11">
          Đăng ký
        </Button>
        <Button variant="ghost" className="h-11" onClick={onDone}>
          Hủy
        </Button>
      </div>
    </form>
  )
}
