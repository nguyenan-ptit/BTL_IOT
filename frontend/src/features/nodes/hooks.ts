import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { deviceKeys } from '@/features/devices/api'
import type { DeviceLifecycle } from '@/features/devices/schemas'
import { roomKeys } from '@/features/rooms/api'
import { changeLifecycle, fetchNodeCommands, moveNode, registerNode } from './api'

export function useNodeCommands(id: string) {
  return useQuery({
    queryKey: deviceKeys.commands(id),
    queryFn: ({ signal }) => fetchNodeCommands(id, signal),
    refetchInterval: 10_000,
  })
}

/** Mọi thay đổi node đều ảnh hưởng trạng thái phòng (ví dụ "Đang bảo trì"), nên làm mới cả hai. */
export function useInvalidateNodes() {
  const queryClient = useQueryClient()
  return () => {
    void queryClient.invalidateQueries({ queryKey: deviceKeys.all })
    void queryClient.invalidateQueries({ queryKey: roomKeys.all })
  }
}

export function useRegisterNode() {
  const invalidate = useInvalidateNodes()
  return useMutation({ mutationFn: registerNode, onSuccess: invalidate })
}

export function useMoveNode(id: string) {
  const invalidate = useInvalidateNodes()
  return useMutation({
    mutationFn: (roomId: string) => moveNode(id, roomId),
    onSettled: invalidate,
  })
}

export function useChangeLifecycle(id: string) {
  const invalidate = useInvalidateNodes()
  return useMutation({
    mutationFn: (body: { lifecycle_status: DeviceLifecycle; maintenance_note?: string }) =>
      changeLifecycle(id, body),
    onSettled: invalidate,
  })
}
