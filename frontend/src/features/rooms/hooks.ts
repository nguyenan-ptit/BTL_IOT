import { useQuery } from '@tanstack/react-query'
import { useDevices } from '@/features/devices/hooks'
import { fetchBoardingHouses, fetchRooms, fetchRoomStatuses, roomKeys } from './api'
import { computeRoomOverall, sortRooms } from './overall'
import { groupRoomsByHouse, roomLabelMap } from './group'
import { roomNodeViews } from './sensors'

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
  const devicesById = new Map(devices.data?.map((device) => [device.device_id, device]))
  const items = rooms.data
    ? sortRooms(
        rooms.data.map((status) => {
          const nodes = roomNodeViews(status, (id) => {
            const device = devicesById.get(id)
            return device?.room_id === status.room.id ? device.data : null
          })
          if (status.nodes === undefined) {
            // API cũ không trả node bị khoá trong trạng thái phòng.
            for (const device of devicesById.values()) {
              if (device.room_id === status.room.id && device.lifecycle_status === 'blocked') {
                nodes.push({
                  id: device.device_id,
                  code: device.device.device_name,
                  lifecycle: 'blocked',
                  connectivity: 'offline',
                  lastSeenAt: null,
                  sensors: [],
                })
              }
            }
          }
          return {
            status,
            nodes,
            overall: computeRoomOverall(status, nodes),
          }
        }),
      )
    : undefined
  return { query: rooms, items }
}

/** Nhãn "Nhà · Phòng" và nhóm phòng theo nhà, cho ô chọn phòng và danh sách. */
export function useRoomLabels() {
  const rooms = useRooms()
  const houses = useBoardingHouses()
  const list = rooms.data ?? []
  const houseList = houses.data ?? []
  const labels = roomLabelMap(list, houseList)
  return {
    groups: groupRoomsByHouse(list, houseList),
    labels,
    label: (roomId: string | null | undefined) =>
      roomId ? (labels.get(roomId) ?? `Phòng ${roomId}`) : 'Chưa gán phòng',
  }
}
