import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import type { User } from '@/features/auth/schemas'
import { isApiError } from '@/shared/api/errors'
import { Button } from '@/shared/ui/Button'
import { Field, inputClass, TextInput } from '@/shared/ui/Field'
import { FormDialog } from '@/shared/ui/FormDialog'
import { useCreateHouse } from '../hooks'
import { houseFormSchema, type HouseForm, type HouseFormInput } from '../schemas'

const EMPTY: HouseFormInput = { name: '', address: '', landlordId: '' }

/** Thêm nhà trọ và giao cho một chủ trọ (POST /api/boarding-houses). */
export function HouseFormDialog({
  open,
  landlords,
  onClose,
}: {
  open: boolean
  landlords: User[]
  onClose: () => void
}) {
  const create = useCreateHouse()
  const form = useForm<HouseFormInput, unknown, HouseForm>({
    resolver: zodResolver(houseFormSchema),
    defaultValues: EMPTY,
  })
  const errors = form.formState.errors
  const close = () => {
    form.reset(EMPTY)
    create.reset()
    onClose()
  }

  return (
    <FormDialog open={open} title="Thêm nhà trọ" onClose={close}>
      <form
        noValidate
        className="flex flex-col gap-4 p-5"
        onSubmit={form.handleSubmit((v) =>
          create.mutate(
            { name: v.name, address: v.address, landlordId: Number(v.landlordId) },
            { onSuccess: close },
          ),
        )}
      >
        <Field id="house-name" label="Tên nhà trọ" error={errors.name?.message}>
          <TextInput id="house-name" aria-invalid={!!errors.name} {...form.register('name')} />
        </Field>
        <Field id="house-address" label="Địa chỉ (không bắt buộc)" error={errors.address?.message}>
          <TextInput
            id="house-address"
            aria-invalid={!!errors.address}
            {...form.register('address')}
          />
        </Field>
        <Field
          id="house-landlord"
          label="Chủ trọ"
          error={errors.landlordId?.message}
          hint={
            landlords.length === 0
              ? 'Chưa có tài khoản chủ trọ nào. Tạo ở trang Tài khoản trước.'
              : undefined
          }
        >
          <select
            id="house-landlord"
            className={inputClass}
            aria-invalid={!!errors.landlordId}
            {...form.register('landlordId')}
          >
            <option value="">Chọn chủ trọ</option>
            {landlords.map((u) => (
              <option key={u.id} value={u.id}>
                {u.displayName || u.username} ({u.username})
              </option>
            ))}
          </select>
        </Field>
        {create.error && (
          <p role="alert" className="text-sm font-medium text-alarm-deep">
            {isApiError(create.error)
              ? create.error.message
              : 'Chưa thêm được. Kiểm tra mạng rồi thử lại.'}
          </p>
        )}
        <div className="flex flex-col-reverse gap-2 border-t border-rule pt-4 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={close}>
            Hủy
          </Button>
          <Button type="submit" loading={create.isPending} disabled={landlords.length === 0}>
            Thêm nhà trọ
          </Button>
        </div>
      </form>
    </FormDialog>
  )
}
