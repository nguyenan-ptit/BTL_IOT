import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useEffect, useState, type ReactNode } from 'react'
import { authKeys } from '@/features/auth/api'
import { onUnauthorized } from '@/shared/api/http'

function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: 1, refetchOnWindowFocus: true, staleTime: 2_000 },
    },
  })
}

/** Khi bất kỳ API nào trả 401, đánh dấu đã đăng xuất để guard đưa về trang đăng nhập. */
function SessionWatcher({ client }: { client: QueryClient }) {
  useEffect(() => onUnauthorized(() => client.setQueryData(authKeys.me, null)), [client])
  return null
}

// NuqsAdapter cần nằm trong router nên được đặt ở route gốc (router.tsx), không ở đây.
export function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(createQueryClient)
  return (
    <QueryClientProvider client={client}>
      <SessionWatcher client={client} />
      {children}
    </QueryClientProvider>
  )
}
