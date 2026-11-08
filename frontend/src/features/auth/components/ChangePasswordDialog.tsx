import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { isApiError } from '@/shared/api/errors'
import { Button } from '@/shared/ui/Button'
import { Field, TextInput } from '@/shared/ui/Field'
import { FormDialog } from '@/shared/ui/FormDialog'
import { changePassword } from '../api'
import { changePasswordFormSchema, type ChangePasswordForm } from '../schemas'

const EMPTY: ChangePasswordForm = { currentPassword: '', newPassword: '', confirmPassword: '' }

export function ChangePasswordDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const mutation = useMutation({ mutationFn: changePassword })
  const form = useForm<ChangePasswordForm>({
    resolver: zodResolver(changePasswordFormSchema),
    defaultValues: EMPTY,
  })
  const errors = form.formState.errors

  const close = () => {
    form.reset(EMPTY)
    mutation.reset()
    onClose()
  }

  const field = (name: keyof ChangePasswordForm, label: string, autoComplete: string) => (
    <Field id={`pw-${name}`} label={label} error={errors[name]?.message}>
      <TextInput
        id={`pw-${name}`}
        type="password"
        autoComplete={autoComplete}
        aria-invalid={!!errors[name]}
        {...form.register(name)}
      />
    </Field>
  )

  return (
    <FormDialog open={open} title="Đổi mật khẩu" onClose={close}>
      {mutation.isSuccess ? (
        <div className="flex flex-col gap-4 p-5">
          <p role="status">Đã đổi mật khẩu.</p>
          <Button className="self-end" onClick={close}>
            Đóng
          </Button>
        </div>
      ) : (
        <form
          noValidate
          className="flex flex-col gap-4 p-5"
          onSubmit={form.handleSubmit(({ currentPassword, newPassword }) =>
            mutation.mutate({ currentPassword, newPassword }),
          )}
        >
          {field('currentPassword', 'Mật khẩu hiện tại', 'current-password')}
          {field('newPassword', 'Mật khẩu mới (8–72 ký tự)', 'new-password')}
          {field('confirmPassword', 'Nhập lại mật khẩu mới', 'new-password')}
          {mutation.error && (
            <p
              role="alert"
              className="rounded-[var(--radius-sheet)] bg-alarm-wash px-3 py-2 text-sm font-medium text-alarm-deep"
            >
              {isApiError(mutation.error)
                ? mutation.error.message
                : 'Chưa đổi được. Kiểm tra mạng rồi thử lại.'}
            </p>
          )}
          <div className="flex flex-col-reverse gap-2 border-t border-rule pt-4 sm:flex-row sm:justify-end">
            <Button variant="secondary" onClick={close}>
              Hủy
            </Button>
            <Button type="submit" loading={mutation.isPending}>
              Đổi mật khẩu
            </Button>
          </div>
        </form>
      )}
    </FormDialog>
  )
}
