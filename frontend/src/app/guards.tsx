import { LoaderCircle, ShieldX } from 'lucide-react'
import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router'
import { useCurrentUser, usePermission } from '@/features/auth/hooks'
import type { Permission } from '@/features/auth/schemas'
import { Button } from '@/shared/ui/Button'
import { LOGIN_PATH } from './paths'

/** Chưa đăng nhập thì về /dang-nhap?next=<đường dẫn hiện tại> (edge case phiên hết hạn). */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { data: user, isPending, isError, refetch } = useCurrentUser()
  const location = useLocation()

  if (isPending) {
    return (
      <div role="status" className="flex min-h-dvh items-center justify-center bg-board-900">
        <LoaderCircle aria-label="Đang tải" className="size-6 animate-spin text-board-200" />
      </div>
    )
  }
  if (isError) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-board-900 p-4">
        <div
          role="alert"
          className="flex max-w-sm flex-col items-start gap-3 rounded-[var(--radius-sheet)] bg-sheet p-5"
        >
          <p className="font-semibold">Không kết nối được máy chủ.</p>
          <p className="text-sm text-ink-soft">Kiểm tra mạng hoặc máy chủ rồi thử lại.</p>
          <Button variant="secondary" size="sm" onClick={() => refetch()}>
            Thử lại
          </Button>
        </div>
      </div>
    )
  }
  if (!user) {
    const next = `${location.pathname}${location.search}`
    const target = next === '/' ? LOGIN_PATH : `${LOGIN_PATH}?next=${encodeURIComponent(next)}`
    return <Navigate to={target} replace />
  }
  return children
}

/** Trang chỉ dành cho người có quyền; người khác thấy "Không có quyền truy cập" (FR-004). */
export function RequirePermission({
  permission,
  children,
}: {
  permission: Permission
  children: ReactNode
}) {
  const allowed = usePermission(permission)
  if (!allowed) return <ForbiddenPage />
  return children
}

export function ForbiddenPage() {
  return (
    <section className="flex flex-col items-start gap-2 py-6">
      <ShieldX aria-hidden className="size-8 text-ink-faint" />
      <h1 className="text-xl font-bold">Không có quyền truy cập</h1>
      <p className="text-ink-soft">
        Tài khoản của bạn không được dùng chức năng này. Cần quyền thì liên hệ quản trị viên.
      </p>
    </section>
  )
}
