import { useMutation, useQueryClient } from '@tanstack/react-query'
import { authKeys } from '@/features/auth/api'
import { roomKeys } from '@/features/rooms/api'
import { createHouse, createRoom } from './api'

/** Thêm nhà trọ/phòng làm đổi danh sách phòng và phạm vi người dùng, nên làm mới cả hai. */
function useInvalidate() {
  const queryClient = useQueryClient()
  return () => {
    void queryClient.invalidateQueries({ queryKey: roomKeys.all })
    void queryClient.invalidateQueries({ queryKey: roomKeys.boardingHouses })
    void queryClient.invalidateQueries({ queryKey: authKeys.me })
  }
}

export function useCreateHouse() {
  const invalidate = useInvalidate()
  return useMutation({ mutationFn: createHouse, onSuccess: invalidate })
}

export function useCreateRoom() {
  const invalidate = useInvalidate()
  return useMutation({ mutationFn: createRoom, onSuccess: invalidate })
}
