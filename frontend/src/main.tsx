import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router/dom'
import { Providers } from './app/providers'
import { router } from './app/router'
import './index.css'

async function enableMocking() {
  if (import.meta.env.VITE_USE_MOCK !== 'true') return
  // Import động để build production không chứa dữ liệu giả lập khi tắt mock.
  const { startMockApi } = await import('./mocks/browser')
  await startMockApi()
}

enableMocking().then(() => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <Providers>
        <RouterProvider router={router} />
      </Providers>
    </StrictMode>,
  )
})
