import { z } from 'zod'
import { roomSchema } from '@/features/rooms/schemas'
import { request } from '@/shared/api/http'

export function createHouse(body: { name: string; address?: string; landlordId: number }) {
  return request(
    '/api/boarding-houses',
    z.looseObject({ id: z.string(), name: z.string(), landlordId: z.string() }),
    { method: 'POST', body },
  )
}

export function createRoom(body: { id: string; boardingHouseId: number; name: string }) {
  return request('/api/rooms', roomSchema, { method: 'POST', body })
}
