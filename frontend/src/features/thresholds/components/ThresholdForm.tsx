import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { isApiError } from '@/shared/api/errors'
import { formatInteger, formatTemperature } from '@/shared/lib/number'
import { Button } from '@/shared/ui/Button'
import { Field, TextInput } from '@/shared/ui/Field'
import { useSaveThresholds } from '../api'
import { thresholdFormSchema, type ThresholdValues } from '../schemas'

/** Form sửa một bộ ngưỡng, áp dụng cho một hoặc nhiều phòng (FR-040, FR-042). */
export function ThresholdForm({
  roomIds,
  roomNames,
  initial,
  defaults,
  onDone,
}: {
  roomIds: string[]
  roomNames: string[]
  initial: ThresholdValues
  defaults: ThresholdValues | undefined
  onDone: () => void
}) {
  const save = useSaveThresholds()
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
        save.mutate({ roomIds, values }, { onSuccess: onDone }),
      )}
    >
      <p className="text-sm text-ink-soft">
        Áp dụng cho{' '}
        <span className="tabular font-semibold text-ink">
          {roomNames.map((n) => `phòng ${n}`).join(', ')}
        </span>
        . Cảnh báo bật khi số đo chạm ngưỡng bật và chỉ tắt khi số đo xuống tới ngưỡng tắt.
      </p>

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-1 font-bold">Khí gas/khói</legend>
        <p className="-mt-1 text-sm text-ink-soft">Số ADC thô của MQ-2 (0–1023), không phải ppm.</p>
        <div className="grid grid-cols-2 gap-3">
          <Field id="gas-on" label="Ngưỡng bật" error={errors.gasOn?.message}>
            <TextInput
              id="gas-on"
              type="number"
              inputMode="numeric"
              step={1}
              aria-invalid={!!errors.gasOn}
              {...form.register('gasOn', num)}
            />
          </Field>
          <Field id="gas-off" label="Ngưỡng tắt" error={errors.gasOff?.message}>
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
              step={0.5}
              aria-invalid={!!errors.tempOn}
              {...form.register('tempOn', num)}
            />
          </Field>
          <Field id="temp-off" label="Ngưỡng tắt" error={errors.tempOff?.message}>
            <TextInput
              id="temp-off"
              type="number"
              inputMode="decimal"
              step={0.5}
              aria-invalid={!!errors.tempOff}
              {...form.register('tempOff', num)}
            />
          </Field>
        </div>
      </fieldset>

      {defaults && (
        <p className="text-sm text-ink-soft">
          Mặc định: gas bật {formatInteger(defaults.gasOn)}, tắt {formatInteger(defaults.gasOff)};
          nhiệt độ bật {formatTemperature(defaults.tempOn)}, tắt{' '}
          {formatTemperature(defaults.tempOff)}.{' '}
          <button
            type="button"
            className="font-semibold text-board-900 underline"
            onClick={() => form.reset(defaults)}
          >
            Điền giá trị mặc định
          </button>
        </p>
      )}

      {save.error && (
        <p
          role="alert"
          className="rounded-[var(--radius-sheet)] bg-alarm-wash px-3 py-2 text-sm font-medium text-alarm-deep"
        >
          {isApiError(save.error, 'VALIDATION_ERROR')
            ? 'Ngưỡng không hợp lệ, kiểm tra lại các ô.'
            : 'Chưa lưu được. Kiểm tra mạng rồi thử lại.'}
        </p>
      )}

      <div className="flex flex-col-reverse gap-2 border-t border-rule pt-4 sm:flex-row sm:justify-end">
        <Button variant="secondary" onClick={onDone}>
          Hủy
        </Button>
        <Button type="submit" loading={save.isPending}>
          {roomIds.length > 1 ? `Lưu cho ${roomIds.length} phòng` : 'Lưu ngưỡng'}
        </Button>
      </div>
    </form>
  )
}
