import { zodResolver } from '@hookform/resolvers/zod'
import { Copy, Info, UserPlus } from 'lucide-react'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { groupRoomsByHouse } from '@/features/rooms/group'
import { useBoardingHouses, useRooms } from '@/features/rooms/hooks'
import { isApiError } from '@/shared/api/errors'
import { roomNumber } from '@/shared/lib/labels'
import { Button } from '@/shared/ui/Button'
import { EmptyState, Skeleton } from '@/shared/ui/DataState'
import { Field, inputClass, TextInput } from '@/shared/ui/Field'
import { Sheet } from '@/shared/ui/Sheet'
import { useCreateTenant } from '../api'
import {
  createTenantFormSchema,
  type CreatedTenant,
  type CreateTenantForm,
  type CreateTenantInput,
} from '../schemas'

const EMPTY: CreateTenantInput = {
  room_id: '',
  username: '',
  display_name: '',
  password: '',
  confirmPassword: '',
}

/** Thông tin đăng nhập vừa tạo, để chủ trọ gửi cho người thuê. Chỉ giữ trong trang, không lưu. */
function CreatedCard({ tenant, password }: { tenant: CreatedTenant; password: string }) {
  const [note, setNote] = useState<string | null>(null)
  const text = `Tài khoản giám sát phòng ${roomNumber(tenant.room_name)}\nTên đăng nhập: ${tenant.username}\nMật khẩu: ${password}`
  return (
    <Sheet className="flex flex-col gap-3 p-4 sm:p-5" role="status">
      <h2 className="font-bold">
        Đã tạo tài khoản cho {tenant.display_name} (phòng {roomNumber(tenant.room_name)})
      </h2>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
        <dt className="text-ink-soft">Tên đăng nhập</dt>
        <dd className="font-mono font-semibold">{tenant.username}</dd>
        <dt className="text-ink-soft">Mật khẩu</dt>
        <dd className="font-mono font-semibold">{password}</dd>
      </dl>
      <p className="text-sm text-ink-soft">
        Gửi thông tin này cho người thuê. Sau khi đăng nhập, họ nên đổi mật khẩu bằng nút "Đổi mật
        khẩu" trên thanh trên cùng. Trang không lưu mật khẩu; rời trang là mất.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="secondary"
          size="sm"
          onClick={() =>
            navigator.clipboard
              .writeText(text)
              .then(() => setNote('Đã sao chép.'))
              .catch(() => setNote('Không sao chép được, hãy chọn và sao chép tay.'))
          }
        >
          <Copy aria-hidden className="size-4" />
          Sao chép thông tin đăng nhập
        </Button>
        {note && <span className="text-sm text-ink-soft">{note}</span>}
      </div>
    </Sheet>
  )
}

/** Người thuê (chủ trọ): tạo tài khoản người thuê cho phòng thuộc nhà trọ của mình. */
export default function TenantsPage() {
  const rooms = useRooms()
  const houses = useBoardingHouses()
  const create = useCreateTenant()
  const [created, setCreated] = useState<{ tenant: CreatedTenant; password: string }[]>([])
  const form = useForm<CreateTenantInput, unknown, CreateTenantForm>({
    resolver: zodResolver(createTenantFormSchema),
    defaultValues: EMPTY,
  })
  const errors = form.formState.errors
  const usernameError =
    errors.username?.message ??
    (isApiError(create.error, 'USERNAME_TAKEN') ? 'Tên đăng nhập này đã có người dùng.' : undefined)
  const otherError =
    create.error && !isApiError(create.error, 'USERNAME_TAKEN')
      ? isApiError(create.error)
        ? create.error.message
        : 'Chưa tạo được. Kiểm tra mạng rồi thử lại.'
      : null

  const onSubmit = form.handleSubmit((values) =>
    create.mutate(values, {
      onSuccess: (tenant) => {
        setCreated((list) => [{ tenant, password: values.password }, ...list])
        form.reset({ ...EMPTY, room_id: values.room_id })
      },
    }),
  )

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight">Người thuê</h1>
        <p className="max-w-3xl text-sm text-ink-soft">
          Tạo tài khoản cho người thuê một phòng trong nhà trọ của bạn. Người thuê chỉ thấy phòng
          của mình, nhận cảnh báo và tiếp nhận được sự cố của phòng đó.
        </p>
      </header>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
        <div className="flex flex-col gap-5">
          {rooms.isPending ? (
            <Skeleton className="h-72" />
          ) : rooms.data?.length === 0 ? (
            <EmptyState title="Chưa có phòng nào">
              Tài khoản của bạn chưa được gán nhà trọ. Liên hệ quản trị viên để được gán trước khi
              thêm người thuê.
            </EmptyState>
          ) : (
            <Sheet className="flex flex-col gap-4 p-4 sm:p-5">
              <h2 className="flex items-center gap-2 text-lg font-bold">
                <UserPlus aria-hidden className="size-5" />
                Thêm người thuê
              </h2>
              <form noValidate className="grid gap-4 sm:grid-cols-2" onSubmit={onSubmit}>
                <Field id="tenant-room" label="Phòng" error={errors.room_id?.message}>
                  <select
                    id="tenant-room"
                    className={inputClass}
                    aria-invalid={!!errors.room_id}
                    {...form.register('room_id')}
                  >
                    <option value="">Chọn phòng</option>
                    {groupRoomsByHouse(rooms.data ?? [], houses.data ?? []).map((group) => (
                      <optgroup key={group.id} label={group.name}>
                        {group.rooms.map((room) => (
                          <option key={room.id} value={room.id}>
                            {group.name} · Phòng {roomNumber(room.name)}
                          </option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                </Field>
                <Field id="tenant-name" label="Tên người thuê" error={errors.display_name?.message}>
                  <TextInput
                    id="tenant-name"
                    autoComplete="off"
                    aria-invalid={!!errors.display_name}
                    {...form.register('display_name')}
                  />
                </Field>
                <Field
                  id="tenant-username"
                  label="Tên đăng nhập"
                  error={usernameError}
                  hint="Chữ thường, số, dấu chấm hoặc gạch dưới, ví dụ thue101.b"
                >
                  <TextInput
                    id="tenant-username"
                    autoComplete="off"
                    autoCapitalize="none"
                    spellCheck={false}
                    aria-invalid={!!usernameError}
                    {...form.register('username')}
                  />
                </Field>
                <div className="hidden sm:block" aria-hidden />
                <Field
                  id="tenant-password"
                  label="Mật khẩu (8–72 ký tự)"
                  error={errors.password?.message}
                >
                  <TextInput
                    id="tenant-password"
                    type="password"
                    autoComplete="new-password"
                    aria-invalid={!!errors.password}
                    {...form.register('password')}
                  />
                </Field>
                <Field
                  id="tenant-password-confirm"
                  label="Nhập lại mật khẩu"
                  error={errors.confirmPassword?.message}
                >
                  <TextInput
                    id="tenant-password-confirm"
                    type="password"
                    autoComplete="new-password"
                    aria-invalid={!!errors.confirmPassword}
                    {...form.register('confirmPassword')}
                  />
                </Field>
                {otherError && (
                  <p
                    role="alert"
                    className="rounded-[var(--radius-sheet)] bg-alarm-wash px-3 py-2 text-sm font-medium text-alarm-deep sm:col-span-2"
                  >
                    {otherError}
                  </p>
                )}
                <div className="sm:col-span-2">
                  <Button type="submit" loading={create.isPending}>
                    Tạo tài khoản
                  </Button>
                </div>
              </form>
            </Sheet>
          )}

          {created.map(({ tenant, password }) => (
            <CreatedCard key={tenant.id} tenant={tenant} password={password} />
          ))}
        </div>

        <aside className="order-first lg:order-none">
          <Sheet className="flex flex-col gap-2 p-4 text-sm">
            <h2 className="flex items-center gap-2 font-bold">
              <Info aria-hidden className="size-4" />
              Những việc cần quản trị viên làm
            </h2>
            <p className="text-ink-soft">
              Hệ thống hiện chỉ cho chủ trọ tạo tài khoản mới. Các việc sau cần liên hệ quản trị
              viên:
            </p>
            <ul className="list-disc space-y-1 pl-5 text-ink-soft">
              <li>Xem danh sách người thuê đang ở</li>
              <li>Cho người thuê rời phòng hoặc chuyển phòng</li>
              <li>Khoá, mở khoá, sửa tên tài khoản</li>
              <li>Gắn một tài khoản đã có sẵn vào phòng</li>
            </ul>
          </Sheet>
        </aside>
      </div>
    </div>
  )
}
