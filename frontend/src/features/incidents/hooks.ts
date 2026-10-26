import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { roomKeys } from '@/features/rooms/api'
import { LIVE_REFETCH_MS } from '@/features/rooms/hooks'
import {
  acknowledgeIncident,
  fetchActiveIncidents,
  fetchIncident,
  fetchIncidents,
  incidentKeys,
  type IncidentFilters,
} from './api'

export function useIncidents(filters: IncidentFilters) {
  return useQuery({
    queryKey: incidentKeys.list(filters),
    queryFn: ({ signal }) => fetchIncidents(filters, signal),
    refetchInterval: LIVE_REFETCH_MS,
    placeholderData: keepPreviousData,
  })
}

/** Sự cố chưa kết thúc trong phạm vi người dùng; dùng cho thông báo nổi và tờ ghim trên thẻ phòng. */
export function useActiveIncidents() {
  return useQuery({
    queryKey: incidentKeys.active,
    queryFn: ({ signal }) => fetchActiveIncidents(signal),
    refetchInterval: LIVE_REFETCH_MS,
  })
}

export function useIncident(id: string) {
  return useQuery({
    queryKey: incidentKeys.detail(id),
    queryFn: ({ signal }) => fetchIncident(id, signal),
    refetchInterval: LIVE_REFETCH_MS,
  })
}

/** Tiếp nhận xong thì làm mới mọi chỗ hiện sự cố và trạng thái phòng. */
export function useAcknowledge() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: acknowledgeIncident,
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: incidentKeys.all })
      void queryClient.invalidateQueries({ queryKey: roomKeys.all })
    },
  })
}
