import { lazy, Suspense, type ReactNode } from 'react'
import { createBrowserRouter } from 'react-router'
import { IncidentAlert } from '@/features/incidents/components/IncidentAlert'
import type { Permission } from '@/features/auth/schemas'
import { ForbiddenPage, RequireAuth, RequirePermission } from './guards'
import { AdminLayout } from './layout/AdminLayout'
import { AppShell } from './layout/AppShell'
import { RootLayout } from './layout/RootLayout'
import { LOGIN_PATH } from './paths'

const LoginPage = lazy(() => import('@/features/auth/pages/LoginPage'))
const OverviewPage = lazy(() => import('@/features/rooms/pages/OverviewPage'))
const IncidentListPage = lazy(() => import('@/features/incidents/pages/IncidentListPage'))
const IncidentDetailPage = lazy(() => import('@/features/incidents/pages/IncidentDetailPage'))
const HistoryPage = lazy(() => import('@/features/history/pages/HistoryPage'))
const NodeListPage = lazy(() => import('@/features/nodes/pages/NodeListPage'))
const NodeDetailPage = lazy(() => import('@/features/nodes/pages/NodeDetailPage'))
const AccountListPage = lazy(() => import('@/features/accounts/pages/AccountListPage'))
const AuditLogPage = lazy(() => import('@/features/audit/pages/AuditLogPage'))
const ThresholdsPage = lazy(() => import('@/features/thresholds/pages/ThresholdsPage'))

function page(node: ReactNode) {
  return <Suspense fallback={<p role="status">Đang tải…</p>}>{node}</Suspense>
}

function guarded(permission: Permission, node: ReactNode) {
  return <RequirePermission permission={permission}>{page(node)}</RequirePermission>
}

// Bảng route theo plan.md. Đường dẫn tiếng Việt không dấu.
export const router = createBrowserRouter([
  {
    element: <RootLayout />,
    children: [
      { path: LOGIN_PATH, element: page(<LoginPage />) },
      {
        element: (
          <RequireAuth>
            <AppShell alertSlot={<IncidentAlert />} />
          </RequireAuth>
        ),
        children: [
          { index: true, element: page(<OverviewPage />) },
          { path: 'su-co', element: page(<IncidentListPage />) },
          { path: 'su-co/:id', element: page(<IncidentDetailPage />) },
          { path: 'lich-su', element: page(<HistoryPage />) },
          { path: 'nguong-canh-bao', element: guarded('thresholds:manage', <ThresholdsPage />) },
          {
            path: 'quan-tri',
            element: <AdminLayout />,
            children: [
              { path: 'node', element: guarded('nodes:manage', <NodeListPage />) },
              { path: 'node/:id', element: guarded('nodes:manage', <NodeDetailPage />) },
              { path: 'tai-khoan', element: guarded('users:manage', <AccountListPage />) },
              { path: 'nhat-ky', element: guarded('audit:read', <AuditLogPage />) },
            ],
          },
          { path: '*', element: <ForbiddenPage /> },
        ],
      },
    ],
  },
])
