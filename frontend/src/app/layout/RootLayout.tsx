import { NuqsAdapter } from 'nuqs/adapters/react-router/v8'
import { Outlet } from 'react-router'

export function RootLayout() {
  return (
    <NuqsAdapter>
      <Outlet />
    </NuqsAdapter>
  )
}
