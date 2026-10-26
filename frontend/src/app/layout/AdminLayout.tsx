import { NavLink, Outlet } from 'react-router'
import { usePermission } from '@/features/auth/hooks'
import { cn } from '@/shared/ui/cn'

/**
 * Khung các trang quản trị. Trên điện thoại thanh dưới đáy chỉ có một mục "Quản trị",
 * nên ở đây có thêm hàng tab để chuyển giữa Node, Tài khoản, Nhật ký. Máy tính đã có trên thanh trên.
 */
export function AdminLayout() {
  const tabs = [
    { to: '/quan-tri/node', label: 'Node', show: usePermission('nodes:manage') },
    { to: '/quan-tri/tai-khoan', label: 'Tài khoản', show: usePermission('users:manage') },
    { to: '/quan-tri/nhat-ky', label: 'Nhật ký', show: usePermission('audit:read') },
  ].filter((t) => t.show)

  return (
    <div className="flex flex-col gap-5">
      {tabs.length > 1 && (
        <nav aria-label="Quản trị" className="-mx-4 border-b border-rule px-4 md:hidden">
          <ul className="flex gap-1">
            {tabs.map((tab) => (
              <li key={tab.to}>
                <NavLink
                  to={tab.to}
                  className={({ isActive }) =>
                    cn(
                      'flex h-11 items-center border-b-2 px-3 text-sm font-semibold',
                      isActive
                        ? 'border-board-900 text-board-900'
                        : 'border-transparent text-ink-soft',
                    )
                  }
                >
                  {tab.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
      )}
      <Outlet />
    </div>
  )
}
