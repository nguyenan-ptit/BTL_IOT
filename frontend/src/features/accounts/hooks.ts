import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { accountKeys, createUser, fetchUsers, setLocked, updateUser, type UserFilters } from './api'

export function useUsers(filters: UserFilters) {
  return useQuery({
    queryKey: accountKeys.list(filters),
    queryFn: ({ signal }) => fetchUsers(filters, signal),
    placeholderData: keepPreviousData,
  })
}

function useInvalidate() {
  const queryClient = useQueryClient()
  return () => void queryClient.invalidateQueries({ queryKey: accountKeys.all })
}

export function useCreateUser() {
  const invalidate = useInvalidate()
  return useMutation({ mutationFn: createUser, onSuccess: invalidate })
}

export function useUpdateUser() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: ({ id, ...body }: Parameters<typeof updateUser>[1] & { id: string }) =>
      updateUser(id, body),
    onSuccess: invalidate,
  })
}

export function useSetLocked() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: ({ id, locked }: { id: string; locked: boolean }) => setLocked(id, locked),
    onSettled: invalidate,
  })
}
