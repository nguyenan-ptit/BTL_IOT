import { z } from 'zod'
import { request } from '@/shared/api/http'
import { boardingHouseSchema, roomSchema, roomStatusSchema } from './schemas'

export const roomKeys = {
  all: ['rooms'] as const,
  statuses: (boardingHouseId?: string) => ['rooms', 'status', boardingHouseId ?? 'all'] as const,
  list: (boardingHouseId?: string) => ['rooms', 'list', boardingHouseId ?? 'all'] as const,
  boardingHouses: ['boarding-houses'] as const,
}

export function fetchRoomStatuses(boardingHouseId?: string, signal?: AbortSignal) {
  return request('/api/rooms/status', z.array(roomStatusSchema), {
    query: { boardingHouseId },
    signal,
  })
}

export function fetchRooms(boardingHouseId?: string, signal?: AbortSignal) {
  return request('/api/rooms', z.array(roomSchema), { query: { boardingHouseId }, signal })
}

export function fetchBoardingHouses(signal?: AbortSignal) {
  return request('/api/boarding-houses', z.array(boardingHouseSchema), { signal })
}
