import { zodResolver } from '@hookform/resolvers/zod'
import { KeyRound } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { isApiError } from '@/shared/api/errors'
import { Button } from '@/shared/ui/Button'
import { Field, inputClass } from '@/shared/ui/Field'
import { Sheet } from '@/shared/ui/Sheet'
import { useAttachExistingMqtt } from '../hooks'
import { attachMqttFormSchema, type AttachMqttForm } from '../schemas'

const EMPTY: AttachMqttForm = {
  connection_checked: false,
  topic_permissions_checked: false,
  verification_note: '',
}

/**
 * Admin xác nhận tài khoản MQTT đã tạo sẵn trên EMQX cho node mới.
 * Đây là xác nhận của người kiểm tra; backend không tự kiểm tra tài khoản hay quyền topic trên EMQX.
 */
export function AttachMqttPanel({ nodeId, username }: { nodeId: string; username: string }) {
  const attach = useAttachExistingMqtt(nodeId)
  const form = useForm<AttachMqttForm>({
    resolver: zodResolver(attachMqttFormSchema),
    defaultValues: EMPTY,
  })
  const errors = form.formState.errors

  return (
    <Sheet className="flex flex-col gap-3 p-4 sm:p-5">
      <h2 className="flex items-center gap-2 font-bold">
        <KeyRound aria-hidden className="size-4" />
        Xác nhận tài khoản MQTT có sẵn
      </h2>
      <p className="text-sm text-ink-soft">
        Dùng khi tài khoản của node đã được tạo trên EMQX và nạp vào ESP. Kiểm tra xong mới xác
        nhận.
      </p>
      <form
        noValidate
        className="flex flex-col gap-3"
        onSubmit={form.handleSubmit((values) =>
          attach.mutate({ mqtt_username: username, ...values }),
        )}
      >
        <Field id="attach-username" label="Tài khoản MQTT">
          <input
            id="attach-username"
            readOnly
            value={username}
            className={`${inputClass} font-mono`}
          />
        </Field>
        <label className="flex items-start gap-2.5 text-sm">
          <input
            type="checkbox"
            className="mt-0.5 size-5 shrink-0 accent-board-900"
            {...form.register('connection_checked')}
          />
          Đã kiểm tra ESP kết nối bằng đúng tài khoản này trên EMQX
        </label>
        {errors.connection_checked && (
          <p className="text-sm text-alarm-deep">{errors.connection_checked.message}</p>
        )}
        <label className="flex items-start gap-2.5 text-sm">
          <input
            type="checkbox"
            className="mt-0.5 size-5 shrink-0 accent-board-900"
            {...form.register('topic_permissions_checked')}
          />
          Đã kiểm tra quyền topic của node, gồm cả việc bị từ chối truy cập topic của node khác
        </label>
        {errors.topic_permissions_checked && (
          <p className="text-sm text-alarm-deep">{errors.topic_permissions_checked.message}</p>
        )}
        <Field
          id="attach-note"
          label="Ghi chú kết quả kiểm tra (10–500 ký tự)"
          error={errors.verification_note?.message}
        >
          <textarea
            id="attach-note"
            rows={3}
            className={inputClass}
            aria-invalid={!!errors.verification_note}
            {...form.register('verification_note')}
          />
        </Field>
        {attach.error && (
          <p role="alert" className="text-sm font-medium text-alarm-deep">
            {isApiError(attach.error)
              ? attach.error.message
              : 'Chưa xác định được kết quả. Tải lại trang để xem trạng thái node trước khi thử lại.'}
          </p>
        )}
        <Button type="submit" loading={attach.isPending} className="w-full">
          Xác nhận tài khoản MQTT
        </Button>
      </form>
    </Sheet>
  )
}
