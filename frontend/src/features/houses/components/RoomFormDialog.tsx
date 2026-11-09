import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import type { BoardingHouse } from '@/features/rooms/schemas'
import { isApiError } from '@/shared/api/errors'
import { Button } from '@/shared/ui/Button'
import { Field, TextInput } from '@/shared/ui/Field'
import { FormDialog } from '@/shared/ui/FormDialog'
import { useCreateRoom } from '../hooks'
import { roomFormSchema, suggestRoomId, type RoomForm } from '../schemas'

const EMPTY: RoomForm = { name: '', id: '' }

/** Thêm phòng vào một nhà trọ (POST /api/rooms). Mã phòng tự gợi ý cho tới khi người dùng sửa. */
export function RoomFormDialog({
  house,
  onClose,
}: {
  house: BoardingHouse | null
  onClose: () => void
}) {
  const create = useCreateRoom()
  const [idTouched, setIdTouched] = useState(false)
  const form = useForm<RoomForm>({ resolver: zodResolver(roomFormSchema), defaultValues: EMPTY })
  const errors = form.formState.errors
  const idError =
    errors.id?.message ??
    (isApiError(create.error, 'ROOM_ID_TAKEN') ? 'Mã phòng này đã có, chọn mã khác.' : undefined)
  const otherError =
    create.error && !isApiError(create.error, 'ROOM_ID_TAKEN')
      ? isApiError(create.error)
        ? create.error.message
        : 'Chưa thêm được. Kiểm tra mạng rồi thử lại.'
      : null

  const close = () => {
    form.reset(EMPTY)
    setIdTouched(false)
    create.reset()
    onClose()
  }
  const nameField = form.register('name')
  const idField = form.register('id')

  return (
    <FormDialog open={house !== null} title={`Thêm phòng · ${house?.name ?? ''}`} onClose={close}>
      <form
        noValidate
        className="flex flex-col gap-4 p-5"
        onSubmit={form.handleSubmit(
          (v) =>
            house &&
            create.mutate(
              { id: v.id, name: v.name, boardingHouseId: Number(house.id) },
              { onSuccess: close },
            ),
        )}
      >
        <Field id="room-name" label="Tên phòng" error={errors.name?.message}>
          <TextInput
            id="room-name"
            placeholder="Phòng 103"
            aria-invalid={!!errors.name}
            {...nameField}
            onChange={(e) => {
              void nameField.onChange(e)
              if (house && !idTouched) {
                form.setValue('id', suggestRoomId(house.id, e.target.value))
              }
            }}
          />
        </Field>
        <Field
          id="room-id"
          label="Mã phòng"
          error={idError}
          hint="Duy nhất trong toàn hệ thống. Dùng khi đăng ký node và trong nhật ký."
        >
          <TextInput
            id="room-id"
            autoCapitalize="none"
            spellCheck={false}
            aria-invalid={!!idError}
            {...idField}
            onChange={(e) => {
              setIdTouched(true)
              void idField.onChange(e)
            }}
          />
        </Field>
        {otherError && (
          <p role="alert" className="text-sm font-medium text-alarm-deep">
            {otherError}
          </p>
        )}
        <div className="flex flex-col-reverse gap-2 border-t border-rule pt-4 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={close}>
            Hủy
          </Button>
          <Button type="submit" loading={create.isPending}>
            Thêm phòng
          </Button>
        </div>
      </form>
    </FormDialog>
  )
}
