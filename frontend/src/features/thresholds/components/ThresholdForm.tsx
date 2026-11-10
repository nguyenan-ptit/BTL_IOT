import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { isApiError } from '@/shared/api/errors'
import { Button } from '@/shared/ui/Button'
import { Field, TextInput } from '@/shared/ui/Field'
import type { Telemetry } from '@/features/devices/schemas'
import { useSendThresholds } from '../api'
import { thresholdFormSchema, type ThresholdValues } from '../schemas'

/** Form gửi ngưỡng mới cho một node. Đóng ngay khi backend nhận lệnh; kết quả hiện trên thẻ node. */
export function ThresholdForm({
  deviceId,
  roomName,
  data,
  initial,
  onDone,
}: {
  deviceId: string
  roomName: string
  data: Telemetry
  initial: ThresholdValues
  onDone: () => void
}) {
  const send = useSendThresholds()
  const form = useForm<ThresholdValues>({
    resolver: zodResolver(thresholdFormSchema),
    defaultValues: initial,
  })
  const errors = form.formState.errors
  const num = { valueAsNumber: true } as const

  return (
    <form
      noValidate
      className="flex flex-col gap-5 p-5"
      onSubmit={form.handleSubmit((values) =>
        send.mutate({ deviceId, data, values }, { onSuccess: onDone }),
      )}
    >
      <p className="text-sm text-ink-soft">
        Gửi cho node <span className="font-semibold text-ink">{deviceId}</span> (phòng{' '}
        <span className="tabular font-semibold text-ink">{roomName}</span>). Node chỉ dùng ngưỡng
        mới sau khi ESP xác nhận đã lưu. Cảnh báo bật khi số đo chạm ngưỡng bật và chỉ tắt khi số đo
        xuống tới ngưỡng tắt.
      </p>

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-1 font-bold">Khí gas/khói</legend>
        <p className="-mt-1 text-sm text-ink-soft">Số ADC thô của MQ-2, không phải ppm.</p>
        <div className="grid grid-cols-2 gap-3">
          <Field id="gas-on" label="Ngưỡng bật (1–1023)" error={errors.gasOn?.message}>
            <TextInput
              id="gas-on"
              type="number"
              inputMode="numeric"
              step={1}
              aria-invalid={!!errors.gasOn}
              {...form.register('gasOn', num)}
            />
          </Field>
          <Field id="gas-off" label="Ngưỡng tắt (0–1022)" error={errors.gasOff?.message}>
            <TextInput
              id="gas-off"
              type="number"
              inputMode="numeric"
              step={1}
              aria-invalid={!!errors.gasOff}
              {...form.register('gasOff', num)}
            />
          </Field>
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-1 font-bold">Nhiệt độ (°C)</legend>
        <div className="grid grid-cols-2 gap-3">
          <Field id="temp-on" label="Ngưỡng bật" error={errors.tempOn?.message}>
            <TextInput
              id="temp-on"
              type="number"
              inputMode="decimal"
              step={0.1}
              aria-invalid={!!errors.tempOn}
              {...form.register('tempOn', num)}
            />
          </Field>
          <Field id="temp-off" label="Ngưỡng tắt" error={errors.tempOff?.message}>
            <TextInput
              id="temp-off"
              type="number"
              inputMode="decimal"
              step={0.1}
              aria-invalid={!!errors.tempOff}
              {...form.register('tempOff', num)}
            />
          </Field>
        </div>
      </fieldset>

      {send.error && (
        <p
          role="alert"
          className="rounded-[var(--radius-sheet)] bg-alarm-wash px-3 py-2 text-sm font-medium text-alarm-deep"
        >
          {isApiError(send.error)
            ? send.error.message
            : 'Chưa gửi được. Kiểm tra mạng rồi thử lại.'}
        </p>
      )}

      <div className="flex flex-col-reverse gap-2 border-t border-rule pt-4 sm:flex-row sm:justify-end">
        <Button variant="secondary" onClick={onDone}>
          Hủy
        </Button>
        <Button type="submit" loading={send.isPending}>
          Gửi ngưỡng
        </Button>
      </div>
    </form>
  )
}
