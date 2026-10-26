import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { isApiError } from '@/shared/api/errors'
import { authKeys, fetchMe, login, logout } from './api'
import type { CurrentUser, Permission } from './schemas'

/** Người dùng đang đăng nhập; `null` khi chưa đăng nhập hoặc hết phiên. */
export function useCurrentUser() {
  return useQuery({
    queryKey: authKeys.me,
    queryFn: async ({ signal }): Promise<CurrentUser | null> => {
      try {
        return await fetchMe(signal)
      } catch (error) {
        if (isApiError(error, 'UNAUTHENTICATED')) return null
        throw error
      }
    },
    staleTime: Infinity,
    retry: false,
  })
}

export function useLogin() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: login,
    onSuccess: (user) => queryClient.setQueryData(authKeys.me, user),
  })
}

export function useLogout() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: logout,
    onSettled: () => {
      queryClient.clear()
      queryClient.setQueryData(authKeys.me, null)
    },
  })
}

/** Giao diện ẩn/hiện theo `permissions` từ backend, không tự suy từ vai trò (FR-004). */
export function usePermission(permission: Permission): boolean {
  const { data } = useCurrentUser()
  return data?.permissions.includes(permission) ?? false
}
