import { roomNumber } from '@/shared/lib/labels'
import type { BoardingHouse, Room } from './schemas'

export type HouseGroup<R> = { id: string; name: string; rooms: R[] }

const byName = (a: string, b: string) => a.localeCompare(b, 'vi', { numeric: true })

/**
 * Nhóm phòng theo nhà trọ. Nhiều nhà có thể cùng có "Phòng 101", nên mọi danh sách chọn phòng
 * phải hiện theo dạng nhà → phòng. Nhà không có trong danh sách hiện "Nhà #mã".
 */
export function groupRoomsByHouse<R extends Pick<Room, 'id' | 'boardingHouseId' | 'name'>>(
  rooms: R[],
  houses: BoardingHouse[],
): HouseGroup<R>[] {
  const groups = new Map<string, HouseGroup<R>>()
  for (const room of rooms) {
    const id = room.boardingHouseId
    const group = groups.get(id) ?? {
      id,
      name: houses.find((h) => h.id === id)?.name ?? `Nhà #${id}`,
      rooms: [],
    }
    group.rooms.push(room)
    groups.set(id, group)
  }
  return [...groups.values()]
    .map((g) => ({ ...g, rooms: [...g.rooms].sort((a, b) => byName(a.name, b.name)) }))
    .sort((a, b) => {
      const unknownA = !houses.some((h) => h.id === a.id)
      const unknownB = !houses.some((h) => h.id === b.id)
      return Number(unknownA) - Number(unknownB) || byName(a.name, b.name)
    })
}

/** Mã phòng → "Nhà A · Phòng 101": dùng ở mọi chỗ hiện phòng ngoài bối cảnh một nhà cụ thể. */
export function roomLabelMap(
  rooms: Pick<Room, 'id' | 'boardingHouseId' | 'name'>[],
  houses: BoardingHouse[],
): Map<string, string> {
  const map = new Map<string, string>()
  for (const group of groupRoomsByHouse(rooms, houses)) {
    for (const room of group.rooms) {
      map.set(room.id, `${group.name} · Phòng ${roomNumber(room.name)}`)
    }
  }
  return map
}
