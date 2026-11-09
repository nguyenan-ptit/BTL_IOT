import { describe, expect, it } from 'vitest'
import { groupRoomsByHouse } from '@/features/rooms/group'

const houses = [
  { id: '2', name: 'Nhà B', landlordId: '1' },
  { id: '1', name: 'Nhà A', landlordId: '1' },
]
const rooms = [
  { id: 'n2-101', boardingHouseId: '2', name: 'Phòng 101', activeNodeId: null },
  { id: 'n1-102', boardingHouseId: '1', name: 'Phòng 102', activeNodeId: null },
  { id: 'n1-101', boardingHouseId: '1', name: 'Phòng 101', activeNodeId: null },
  { id: 'x-1', boardingHouseId: '9', name: 'Phòng 1', activeNodeId: null },
]

describe('nhóm phòng theo nhà trọ', () => {
  it('xếp nhà theo tên, phòng theo số; phòng trùng tên tách theo nhà', () => {
    const groups = groupRoomsByHouse(rooms, houses)
    expect(groups.map((g) => g.name)).toEqual(['Nhà A', 'Nhà B', 'Nhà #9'])
    expect(groups[0]?.rooms.map((r) => r.id)).toEqual(['n1-101', 'n1-102'])
    expect(groups[1]?.rooms.map((r) => r.id)).toEqual(['n2-101'])
  })
})
