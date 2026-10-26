import { http, HttpResponse } from 'msw'
import type { RoomStatus, SensorReading } from '@/features/rooms/schemas'
import { connectivityOf, db, nodeOfRoom, roomIdsInScope } from '../db'
import { currentHazards } from '../simulator'
import { requireUser } from './util'

function roomStatus(roomId: string): RoomStatus | null {
  const room = db.rooms.find((r) => r.id === roomId)
  if (!room) return null
  const node = nodeOfRoom(room.id)
  const list = db.measurements.get(room.id) ?? []
  const last = list[list.length - 1]
  const faulty = node?.faultySensors ?? new Set()
  const sensors: SensorReading[] = [
    faulty.has('gas')
      ? { kind: 'gas', health: 'fault', value: null }
      : { kind: 'gas', health: 'ok', value: last?.gas ?? null },
    faulty.has('temperature')
      ? { kind: 'temperature', health: 'fault', value: null }
      : { kind: 'temperature', health: 'ok', value: last?.temperature ?? null },
    faulty.has('flame')
      ? { kind: 'flame', health: 'fault', value: null }
      : { kind: 'flame', health: 'ok', value: last?.flame ?? null },
  ]
  const connectivity = node ? connectivityOf(node) : 'offline'
  const active = db.incidents.find((i) => i.roomId === room.id && i.status !== 'resolved')
  return {
    room: { id: room.id, name: room.name, boardingHouseId: room.boardingHouseId },
    node: node
      ? {
          id: node.id,
          code: node.code,
          lifecycle: node.lifecycle,
          connectivity,
          lastSeenAt: node.lastSeenAt,
        }
      : null,
    sensors,
    activeIncidentId: active?.id ?? null,
    hazardSigns: connectivity === 'online' ? currentHazards(room.id) : [],
  }
}

export const roomHandlers = [
  http.get('/api/rooms/status', ({ request }) => {
    const user = requireUser()
    if (user instanceof Response) return user
    const houseId = new URL(request.url).searchParams.get('boardingHouseId')
    const scope = roomIdsInScope(user)
    const result = db.rooms
      .filter((r) => scope.has(r.id) && (!houseId || r.boardingHouseId === houseId))
      .map((r) => roomStatus(r.id))
      .filter((s): s is RoomStatus => s !== null)
    return HttpResponse.json(result)
  }),

  http.get('/api/rooms', ({ request }) => {
    const user = requireUser()
    if (user instanceof Response) return user
    const houseId = new URL(request.url).searchParams.get('boardingHouseId')
    const scope = roomIdsInScope(user)
    return HttpResponse.json(
      db.rooms.filter((r) => scope.has(r.id) && (!houseId || r.boardingHouseId === houseId)),
    )
  }),

  http.get('/api/boarding-houses', () => {
    const user = requireUser()
    if (user instanceof Response) return user
    const scope = roomIdsInScope(user)
    const houseIds = new Set(db.rooms.filter((r) => scope.has(r.id)).map((r) => r.boardingHouseId))
    return HttpResponse.json(db.boardingHouses.filter((h) => houseIds.has(h.id)))
  }),
]
