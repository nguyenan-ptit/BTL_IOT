import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  accountKeys,
  createLandlordWithoutHouse,
  createUser,
  fetchUsers,
  setLocked,
  updateUser,
  type UserFilters,
} from './api'
import { landlordWithoutHouse } from './schemas'

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
  return useMutation({
    // Hai API trả về khác nhau; form chỉ cần biết đã tạo xong rồi tải lại danh sách.
    mutationFn: async (body: Parameters<typeof createUser>[0]): Promise<void> => {
      if (
        landlordWithoutHouse({ role: body.role, boardingHouseIds: body.scope.boardingHouseIds })
      ) {
        await createLandlordWithoutHouse(body)
      } else {
        await createUser(body)
      }
    },
    onSuccess: invalidate,
  })
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
