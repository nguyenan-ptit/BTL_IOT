import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { Navigate, useNavigate, useSearchParams } from 'react-router'
import { safeNextPath } from '@/app/paths'
import { isApiError } from '@/shared/api/errors'
import { Button } from '@/shared/ui/Button'
import { Field, TextInput } from '@/shared/ui/Field'
import { useCurrentUser, useLogin } from '../hooks'
import { loginFormSchema, type LoginForm } from '../schemas'

const USE_MOCK = import.meta.env.VITE_USE_MOCK === 'true'
// Tên đăng nhập mẫu của dữ liệu giả lập (mocks/seed.ts). Không hiện khi nối backend thật.
const DEMO_USERS = [
  { username: 'chutro', label: 'Chủ trọ' },
  { username: 'thue101', label: 'Người thuê 101' },
  { username: 'thue102', label: 'Người thuê 102' },
  { username: 'admin', label: 'Quản trị viên' },
]

function loginErrorMessage(error: unknown): string {
  if (isApiError(error, 'ACCOUNT_LOCKED'))
    return 'Tài khoản đã bị khóa. Liên hệ quản trị viên để mở lại.'
  if (isApiError(error, 'INVALID_CREDENTIALS')) return 'Tên đăng nhập hoặc mật khẩu không đúng.'
  return 'Không kết nối được máy chủ. Kiểm tra mạng rồi thử lại.'
}

export default function LoginPage() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const next = safeNextPath(params.get('next'))
  const { data: user } = useCurrentUser()
  const login = useLogin()
  const {
    register,
    handleSubmit,
    setValue,
    setFocus,
    formState: { errors },
  } = useForm<LoginForm>({ resolver: zodResolver(loginFormSchema) })

  if (user) return <Navigate to={next} replace />

  const onSubmit = handleSubmit((form) =>
    login.mutate(form, { onSuccess: () => navigate(next, { replace: true }) }),
  )

  return (
    <div className="flex min-h-dvh flex-col bg-board-900 px-4 py-10 sm:items-center sm:justify-center">
      <div className="mx-auto w-full max-w-sm">
        <div className="mb-6 text-white">
          <h1 className="text-2xl font-bold tracking-tight">Giám sát cháy/gas nhà trọ</h1>
          <p className="mt-1 text-board-200">Theo dõi phòng và tiếp nhận sự cố</p>
        </div>

        <form
          onSubmit={onSubmit}
          noValidate
          className="flex flex-col gap-4 rounded-[var(--radius-sheet)] bg-sheet p-5 sm:p-6"
        >
          <h2 className="text-lg font-bold">Đăng nhập</h2>

          <Field id="username" label="Tên đăng nhập" error={errors.username?.message}>
            <TextInput
              id="username"
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              aria-invalid={!!errors.username}
              aria-describedby={errors.username ? 'username-error' : undefined}
              {...register('username')}
            />
          </Field>

          <Field id="password" label="Mật khẩu" error={errors.password?.message}>
            <TextInput
              id="password"
              type="password"
              autoComplete="current-password"
              aria-invalid={!!errors.password}
              aria-describedby={errors.password ? 'password-error' : undefined}
              {...register('password')}
            />
          </Field>

          {login.error && (
            <p
              role="alert"
              className="rounded-[var(--radius-sheet)] bg-alarm-wash px-3 py-2 text-sm font-medium text-alarm-deep"
            >
              {loginErrorMessage(login.error)}
            </p>
          )}

          <Button type="submit" size="lg" loading={login.isPending} className="mt-1 w-full">
            {login.isPending ? 'Đang đăng nhập…' : 'Đăng nhập'}
          </Button>
        </form>

        {USE_MOCK && (
          <div className="mt-6 text-sm text-board-100">
            <p className="mb-2">Dữ liệu giả lập. Chọn nhanh tài khoản mẫu:</p>
            <div className="flex flex-wrap gap-2">
              {DEMO_USERS.map((demo) => (
                <button
                  key={demo.username}
                  type="button"
                  onClick={() => {
                    setValue('username', demo.username)
                    setFocus('password')
                  }}
                  className="rounded-full px-3 py-1.5 font-semibold text-white ring-1 ring-board-200/40 ring-inset hover:bg-board-800"
                >
                  {demo.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
