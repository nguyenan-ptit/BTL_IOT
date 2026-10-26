import { zodResolver } from '@hookform/resolvers/zod'
import { useForm, useWatch, type Resolver } from 'react-hook-form'
import type { User } from '@/features/auth/schemas'
import { useBoardingHouses, useRooms } from '@/features/rooms/hooks'
import { isApiError } from '@/shared/api/errors'
import { roleLabel } from '@/shared/lib/labels'
import { roleSchema } from '@/shared/schemas/common'
import { Button } from '@/shared/ui/Button'
import { Field, inputClass, TextInput } from '@/shared/ui/Field'
import { useCreateUser, useUpdateUser } from '../hooks'
import { createUserFormSchema, editUserFormSchema, toScope, type CreateUserForm } from '../schemas'

const apiErrorText: Record<string, string> = {
  USERNAME_TAKEN: 'Tên đăng nhập này đã có người dùng.',
  LAST_ADMIN: 'Phải còn ít nhất một quản trị viên đang hoạt động.',
}

/** Form tạo hoặc sửa tài khoản (FR-029, FR-030). Mật khẩu chỉ nhập khi tạo, không bao giờ hiện lại. */
export function AccountForm({ user, onDone }: { user?: User; onDone: () => void }) {
  const editing = !!user
  const houses = useBoardingHouses()
  const rooms = useRooms()
  const create = useCreateUser()
  const update = useUpdateUser()
  const mutation = editing ? update : create

  const form = useForm<CreateUserForm>({
    resolver: zodResolver(
      editing ? editUserFormSchema : createUserFormSchema,
    ) as unknown as Resolver<CreateUserForm>,
    defaultValues: {
      username: user?.username ?? '',
      displayName: user?.displayName ?? '',
      password: '',
      role: user?.role ?? 'tenant',
      boardingHouseIds: user?.scope.boardingHouseIds ?? [],
      roomIds: user?.scope.roomIds ?? [],
    },
  })
  const role = useWatch({ control: form.control, name: 'role' })
  const errors = form.formState.errors

  const submit = form.handleSubmit((values) => {
    const scope = toScope(values)
    if (user) {
      update.mutate(
        { id: user.id, displayName: values.displayName, role: values.role, scope },
        { onSuccess: onDone },
      )
    } else {
      create.mutate(
        {
          username: values.username,
          displayName: values.displayName,
          password: values.password,
          role: values.role,
          scope,
        },
        { onSuccess: onDone },
      )
    }
  })

  const apiCode = isApiError(mutation.error) ? mutation.error.code : null
  const usernameError =
    errors.username?.message ??
    (apiCode === 'USERNAME_TAKEN' ? apiErrorText.USERNAME_TAKEN : undefined)

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4 p-5">
      {editing ? (
        <p className="text-sm text-ink-soft">
          Tên đăng nhập: <span className="font-semibold text-ink">{user.username}</span>
        </p>
      ) : (
        <Field id="acc-username" label="Tên đăng nhập" error={usernameError}>
          <TextInput
            id="acc-username"
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            aria-invalid={!!usernameError}
            {...form.register('username')}
          />
        </Field>
      )}

      <Field id="acc-name" label="Tên hiển thị" error={errors.displayName?.message}>
        <TextInput
          id="acc-name"
          aria-invalid={!!errors.displayName}
          {...form.register('displayName')}
        />
      </Field>

      {!editing && (
        <Field
          id="acc-password"
          label="Mật khẩu ban đầu"
          error={errors.password?.message}
          hint="Ít nhất 8 ký tự. Người dùng nên đổi sau lần đăng nhập đầu."
        >
          <TextInput
            id="acc-password"
            type="password"
            autoComplete="new-password"
            aria-invalid={!!errors.password}
            {...form.register('password')}
          />
        </Field>
      )}

      <Field id="acc-role" label="Vai trò">
        <select id="acc-role" className={inputClass} {...form.register('role')}>
          {roleSchema.options.map((r) => (
            <option key={r} value={r}>
              {roleLabel[r]}
            </option>
          ))}
        </select>
      </Field>

      {role === 'landlord' && (
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-sm font-semibold">Nhà trọ quản lý</legend>
          {houses.data?.map((h) => (
            <label key={h.id} className="flex items-center gap-2.5">
              <input
                type="checkbox"
                value={h.id}
                className="size-5 accent-board-900"
                {...form.register('boardingHouseIds')}
              />
              {h.name}
            </label>
          ))}
          {errors.boardingHouseIds && (
            <p className="text-sm font-medium text-alarm-deep">{errors.boardingHouseIds.message}</p>
          )}
        </fieldset>
      )}

      {role === 'tenant' && (
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-sm font-semibold">Phòng được xem</legend>
          <div className="flex flex-wrap gap-x-5 gap-y-2">
            {rooms.data?.map((r) => (
              <label key={r.id} className="tabular flex items-center gap-2.5">
                <input
                  type="checkbox"
                  value={r.id}
                  className="size-5 accent-board-900"
                  {...form.register('roomIds')}
                />
                Phòng {r.name}
              </label>
            ))}
          </div>
          {errors.roomIds && (
            <p className="text-sm font-medium text-alarm-deep">{errors.roomIds.message}</p>
          )}
        </fieldset>
      )}

      {role === 'admin' && (
        <p className="text-sm text-ink-soft">
          Quản trị viên xem được mọi phòng và quản lý node, tài khoản, nhật ký.
        </p>
      )}

      {mutation.error && apiCode !== 'USERNAME_TAKEN' && (
        <p
          role="alert"
          className="rounded-[var(--radius-sheet)] bg-alarm-wash px-3 py-2 text-sm font-medium text-alarm-deep"
        >
          {(apiCode && apiErrorText[apiCode]) ?? 'Chưa lưu được. Kiểm tra mạng rồi thử lại.'}
        </p>
      )}

      <div className="flex flex-col-reverse gap-2 border-t border-rule pt-4 sm:flex-row sm:justify-end">
        <Button variant="secondary" onClick={onDone}>
          Hủy
        </Button>
        <Button type="submit" loading={mutation.isPending}>
          {editing ? 'Lưu thay đổi' : 'Tạo tài khoản'}
        </Button>
      </div>
    </form>
  )
}
