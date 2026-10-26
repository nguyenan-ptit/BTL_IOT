import {
  BellRing,
  ClipboardList,
  Cpu,
  History,
  LayoutGrid,
  LogOut,
  UsersRound,
  WifiOff,
} from 'lucide-react'
import type { ReactNode } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router'
import { useCurrentUser, useLogout, usePermission } from '@/features/auth/hooks'
import { useActiveIncidents } from '@/features/incidents/hooks'
import { useConnection } from '@/shared/api/useConnection'
import { formatTime } from '@/shared/lib/datetime'
import { roleLabel } from '@/shared/lib/labels'
import { cn } from '@/shared/ui/cn'
import { LOGIN_PATH } from '../paths'

type NavItem = { to: string; label: string; icon: typeof LayoutGrid; end?: boolean; badge?: number }

function useNavItems(): { main: NavItem[]; admin: NavItem[] } {
  const canManageNodes = usePermission('nodes:manage')
  const canManageUsers = usePermission('users:manage')
  const canReadAudit = usePermission('audit:read')
  const active = useActiveIncidents()
  const openCount = active.data?.filter((i) => i.status === 'open').length ?? 0
  const admin: NavItem[] = []
  if (canManageNodes) admin.push({ to: '/quan-tri/node', label: 'Node', icon: Cpu })
  if (canManageUsers)
    admin.push({ to: '/quan-tri/tai-khoan', label: 'Tài khoản', icon: UsersRound })
  if (canReadAudit) admin.push({ to: '/quan-tri/nhat-ky', label: 'Nhật ký', icon: ClipboardList })
  return {
    main: [
      { to: '/', label: 'Tổng quan', icon: LayoutGrid, end: true },
      { to: '/su-co', label: 'Sự cố', icon: BellRing, badge: openCount },
      { to: '/lich-su', label: 'Lịch sử', icon: History },
    ],
    admin,
  }
}

/** Số sự cố chưa ai tiếp nhận, cạnh mục "Sự cố" trong điều hướng. */
function NavBadge({ count, className }: { count?: number; className?: string }) {
  if (!count) return null
  return (
    <span
      className={cn(
        'tabular ml-1.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-alarm px-1.5 text-xs leading-none font-bold text-white',
        className,
      )}
    >
      {count}
      <span className="sr-only"> sự cố chưa tiếp nhận</span>
    </span>
  )
}

/** Khung chung: thanh bảng tin xanh dương đậm, điều hướng theo quyền, dải mất kết nối. */
export function AppShell({ alertSlot }: { alertSlot?: ReactNode }) {
  const { data: user } = useCurrentUser()
  const logout = useLogout()
  const navigate = useNavigate()
  const connection = useConnection()
  const { main, admin } = useNavItems()

  return (
    <div className="flex min-h-dvh flex-col pb-16 md:pb-0">
      <header className="sticky top-0 z-30 bg-board-900 text-white">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-6 px-4 md:px-6">
          <NavLink to="/" className="flex shrink-0 flex-col leading-none">
            <span className="text-[15px] font-bold tracking-tight">Giám sát cháy/gas</span>
            <span className="text-xs font-medium text-board-200">Nhà trọ</span>
          </NavLink>

          <nav aria-label="Điều hướng chính" className="hidden h-full items-stretch gap-1 md:flex">
            {[...main, ...admin].map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  cn(
                    'flex items-center border-b-2 px-3 text-sm font-semibold transition-colors',
                    isActive
                      ? 'border-white text-white'
                      : 'border-transparent text-board-200 hover:text-white',
                  )
                }
              >
                {item.label}
                <NavBadge count={item.badge} />
              </NavLink>
            ))}
          </nav>

          {user && (
            <div className="ml-auto flex items-center gap-3">
              <div className="hidden text-right leading-tight sm:block">
                <p className="text-sm font-semibold">{user.displayName}</p>
                <p className="text-xs text-board-200">{roleLabel[user.role]}</p>
              </div>
              <button
                type="button"
                onClick={() => logout.mutate(undefined, { onSettled: () => navigate(LOGIN_PATH) })}
                className="flex h-9 items-center gap-1.5 rounded-[var(--radius-sheet)] px-2.5 text-sm font-semibold text-board-100 hover:bg-board-800 hover:text-white"
              >
                <LogOut aria-hidden className="size-4" />
                <span>Đăng xuất</span>
              </button>
            </div>
          )}
        </div>

        {!connection.online && (
          <div
            role="alert"
            className="hatch-offline border-t border-offline/40 bg-offline-wash text-offline-ink"
          >
            <p className="mx-auto flex max-w-7xl items-center gap-2 px-4 py-2 text-sm font-semibold md:px-6">
              <WifiOff aria-hidden className="size-4 shrink-0" />
              <span>
                Không kết nối được máy chủ
                {connection.lastSuccessAt &&
                  `, dữ liệu đang hiện là của lúc ${formatTime(connection.lastSuccessAt)}`}
                . Đang thử lại…
              </span>
            </p>
          </div>
        )}
        {alertSlot}
      </header>

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-5 md:px-6 md:py-8">
        <Outlet />
      </main>

      {/* Điện thoại: thanh điều hướng dưới đáy để bấm bằng một tay (PRODUCT.md). */}
      <nav
        aria-label="Điều hướng chính"
        className="fixed inset-x-0 bottom-0 z-30 border-t border-rule bg-sheet md:hidden"
      >
        <ul className="grid h-16 auto-cols-fr grid-flow-col">
          {[...main, ...(admin[0] ? [{ ...admin[0], label: 'Quản trị' }] : [])].map((item) => {
            const Icon = item.icon
            return (
              <li key={item.to}>
                <NavLink
                  to={item.to}
                  end={item.end}
                  className={({ isActive }) =>
                    cn(
                      'flex h-full flex-col items-center justify-center gap-1 text-xs font-semibold',
                      isActive ? 'text-board-900' : 'text-ink-faint',
                    )
                  }
                >
                  <span className="relative">
                    <Icon aria-hidden className="size-5" />
                    <NavBadge count={item.badge} className="absolute -top-1.5 left-3" />
                  </span>
                  {item.label}
                </NavLink>
              </li>
            )
          })}
        </ul>
      </nav>
    </div>
  )
}
