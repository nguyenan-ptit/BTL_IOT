import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { roomKeys } from '@/features/rooms/api'
import type { NodeLifecycle } from '@/shared/schemas/common'
import {
  assignNode,
  fetchNode,
  fetchNodeHistory,
  fetchNodes,
  nodeKeys,
  registerNode,
  transitionNode,
} from './api'
import type { NodeAction } from './schemas'

export function useNodes(lifecycle: NodeLifecycle[], page: number) {
  return useQuery({
    queryKey: nodeKeys.list(lifecycle, page),
    queryFn: ({ signal }) => fetchNodes(lifecycle, page, signal),
    refetchInterval: 10_000,
    placeholderData: keepPreviousData,
  })
}

export function useNode(id: string) {
  return useQuery({
    queryKey: nodeKeys.detail(id),
    queryFn: ({ signal }) => fetchNode(id, signal),
    refetchInterval: 10_000,
  })
}

export function useNodeHistory(id: string) {
  return useQuery({
    queryKey: nodeKeys.history(id),
    queryFn: ({ signal }) => fetchNodeHistory(id, signal),
  })
}

/** Mọi thay đổi node đều ảnh hưởng trạng thái phòng (ví dụ "Đang bảo trì"), nên làm mới cả hai. */
function useInvalidateNodes() {
  const queryClient = useQueryClient()
  return () => {
    void queryClient.invalidateQueries({ queryKey: nodeKeys.all })
    void queryClient.invalidateQueries({ queryKey: roomKeys.all })
  }
}

export function useRegisterNode() {
  const invalidate = useInvalidateNodes()
  return useMutation({ mutationFn: registerNode, onSuccess: invalidate })
}

export function useAssignNode(id: string) {
  const invalidate = useInvalidateNodes()
  return useMutation({
    mutationFn: (roomId: string | null) => assignNode(id, roomId),
    onSettled: invalidate,
  })
}

export function useTransitionNode(id: string) {
  const invalidate = useInvalidateNodes()
  return useMutation({
    mutationFn: (action: NodeAction) => transitionNode(id, action),
    onSettled: invalidate,
  })
}
