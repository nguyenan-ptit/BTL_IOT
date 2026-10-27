import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { z } from 'zod'
import { request } from '@/shared/api/http'
import { roomThresholdSchema, thresholdValuesSchema, type ThresholdValues } from './schemas'

export const thresholdKeys = {
  all: ['thresholds'] as const,
  list: ['thresholds', 'list'] as const,
  defaults: ['thresholds', 'defaults'] as const,
}

export function useThresholds(enabled = true) {
  return useQuery({
    queryKey: thresholdKeys.list,
    queryFn: ({ signal }) => request('/api/thresholds', z.array(roomThresholdSchema), { signal }),
    // Hỏi lại để thấy trạng thái đồng bộ đổi từ "Chờ node áp dụng" sang "Đang áp dụng".
    refetchInterval: 3_000,
    enabled,
  })
}

export function useDefaultThresholds() {
  return useQuery({
    queryKey: thresholdKeys.defaults,
    queryFn: ({ signal }) => request('/api/thresholds/defaults', thresholdValuesSchema, { signal }),
    staleTime: Infinity,
  })
}

export function useSaveThresholds() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: { roomIds: string[]; values: ThresholdValues }) =>
      request('/api/thresholds', z.array(roomThresholdSchema), { method: 'PUT', body }),
    onSettled: () => void queryClient.invalidateQueries({ queryKey: thresholdKeys.all }),
  })
}

export function useResetThresholds() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (roomIds: string[]) =>
      request('/api/thresholds/reset', z.array(roomThresholdSchema), {
        method: 'POST',
        body: { roomIds },
      }),
    onSettled: () => void queryClient.invalidateQueries({ queryKey: thresholdKeys.all }),
  })
}
