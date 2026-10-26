import { NuqsAdapter } from 'nuqs/adapters/react-router/v8'
import { lazy, Suspense } from 'react'
import { Outlet } from 'react-router'

const SimulatorPanel =
  import.meta.env.VITE_USE_MOCK === 'true' ? lazy(() => import('@/mocks/SimulatorPanel')) : null

export function RootLayout() {
  return (
    <NuqsAdapter>
      <Outlet />
      {SimulatorPanel && (
        <Suspense fallback={null}>
          <SimulatorPanel />
        </Suspense>
      )}
    </NuqsAdapter>
  )
}
