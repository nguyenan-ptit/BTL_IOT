import { useQuery } from '@tanstack/react-query'
import { fetchBoardingHouses, fetchRooms, fetchRoomStatuses, roomKeys } from './api'
import { computeRoomOverall, sortRooms } from './overall'

/** Hỏi lại mỗi 3 giây để trạng thái mới lên màn hình trong 5 giây (FR-010, research R3). */
export const LIVE_REFETCH_MS = 3_000

export function useRoomStatuses(boardingHouseId?: string) {
  return useQuery({
    queryKey: roomKeys.statuses(boardingHouseId),
    queryFn: ({ signal }) => fetchRoomStatuses(boardingHouseId, signal),
    refetchInterval: LIVE_REFETCH_MS,
    // TanStack Query mặc định dừng hỏi lại khi tab bị ẩn và hỏi ngay khi quay lại tab.
    refetchIntervalInBackground: false,
    select: (statuses) =>
      sortRooms(statuses.map((status) => ({ status, overall: computeRoomOverall(status) }))),
  })
}

export function useRooms(boardingHouseId?: string) {
  return useQuery({
    queryKey: roomKeys.list(boardingHouseId),
    queryFn: ({ signal }) => fetchRooms(boardingHouseId, signal),
  })
}

export function useBoardingHouses() {
  return useQuery({
    queryKey: roomKeys.boardingHouses,
    queryFn: ({ signal }) => fetchBoardingHouses(signal),
    staleTime: 60_000,
  })
}
