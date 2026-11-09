import { useQuery } from '@tanstack/react-query'
import { useDevices } from '@/features/devices/hooks'
import type { Telemetry } from '@/features/devices/schemas'
import { fetchBoardingHouses, fetchRooms, fetchRoomStatuses, roomKeys } from './api'
import { computeRoomOverall, sortRooms } from './overall'
import { sensorViews } from './sensors'

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

/**
 * Trang tổng quan: trạng thái phòng (/api/rooms/status) ghép với telemetry gốc (/api/devices)
 * để biết MQ-2 đang làm nóng hay lỗi thật. /api/devices lỗi thì vẫn hiện theo /api/rooms/status.
 */
export function useRoomOverview() {
  const rooms = useQuery({
    queryKey: roomKeys.statuses(undefined),
    queryFn: ({ signal }) => fetchRoomStatuses(undefined, signal),
    refetchInterval: LIVE_REFETCH_MS,
    refetchIntervalInBackground: false,
  })
  const devices = useDevices()
  const telemetryOf = (nodeId: string): Telemetry | null =>
    devices.data?.find((d) => d.device_id === nodeId)?.data ?? null
  const items = rooms.data
    ? sortRooms(
        rooms.data.map((status) => {
          const telemetry = status.node ? telemetryOf(status.node.id) : null
          return {
            status,
            sensors: sensorViews(status, telemetry),
            overall: computeRoomOverall(status, telemetry),
          }
        }),
      )
    : undefined
  return { query: rooms, items }
}
