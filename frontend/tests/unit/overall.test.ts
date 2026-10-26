import { describe, expect, it } from 'vitest'
import { computeRoomOverall, sortRooms } from '@/features/rooms/overall'
import type { RoomStatus } from '@/features/rooms/schemas'

function status(
  overrides: Partial<RoomStatus> = {},
  node: Partial<NonNullable<RoomStatus['node']>> = {},
): RoomStatus {
  return {
    room: { id: 'r101', name: '101', boardingHouseId: 'bh1' },
    node: {
      id: 'n1',
      code: 'NODE-101',
      lifecycle: 'active',
      connectivity: 'online',
      lastSeenAt: '2026-10-26T07:00:00Z',
      ...node,
    },
    sensors: [
      { kind: 'gas', health: 'ok', value: 200 },
      { kind: 'temperature', health: 'ok', value: 29.5 },
      { kind: 'flame', health: 'ok', value: false },
    ],
    activeIncidentId: null,
    hazardSigns: [],
    ...overrides,
  }
}

const brokenTemp: RoomStatus['sensors'] = [
  { kind: 'gas', health: 'ok', value: 200 },
  { kind: 'temperature', health: 'fault', value: null },
  { kind: 'flame', health: 'ok', value: false },
]

describe('computeRoomOverall', () => {
  it('bình thường khi node chạy và mọi cảm biến tốt', () => {
    expect(computeRoomOverall(status())).toBe('normal')
  })

  it('chưa có thiết bị khi không có node hoặc node mới đăng ký', () => {
    expect(computeRoomOverall(status({ node: null }))).toBe('no_device')
    expect(computeRoomOverall(status({}, { lifecycle: 'registered' }))).toBe('no_device')
  })

  it('cảnh báo khi có sự cố hoặc dấu hiệu nguy hiểm', () => {
    expect(computeRoomOverall(status({ activeIncidentId: 'i1' }))).toBe('alarm')
    expect(computeRoomOverall(status({ hazardSigns: ['gas'] }))).toBe('alarm')
  })

  it('cảnh báo thắng lỗi cảm biến (đèn đỏ ưu tiên hơn đèn vàng)', () => {
    expect(computeRoomOverall(status({ activeIncidentId: 'i1', sensors: brokenTemp }))).toBe(
      'alarm',
    )
  })

  it('lỗi cảm biến khi node gửi dữ liệu nhưng một cảm biến hỏng', () => {
    expect(computeRoomOverall(status({ sensors: brokenTemp }))).toBe('sensor_fault')
  })

  it('mất kết nối khác lỗi cảm biến và thắng nó', () => {
    expect(computeRoomOverall(status({}, { connectivity: 'offline' }))).toBe('offline')
    expect(computeRoomOverall(status({ sensors: brokenTemp }, { connectivity: 'offline' }))).toBe(
      'offline',
    )
  })

  it('bảo trì che mất kết nối và lỗi cảm biến (US4 kịch bản 3)', () => {
    expect(
      computeRoomOverall(
        status({ sensors: brokenTemp }, { lifecycle: 'maintenance', connectivity: 'offline' }),
      ),
    ).toBe('maintenance')
  })
})

describe('sortRooms', () => {
  it('đưa phòng cảnh báo lên đầu, rồi theo số phòng', () => {
    const rooms = [
      {
        overall: 'normal' as const,
        status: status({ room: { id: 'a', name: '103', boardingHouseId: 'bh1' } }),
      },
      {
        overall: 'alarm' as const,
        status: status({ room: { id: 'b', name: '102', boardingHouseId: 'bh1' } }),
      },
      {
        overall: 'normal' as const,
        status: status({ room: { id: 'c', name: '101', boardingHouseId: 'bh1' } }),
      },
    ]
    expect(sortRooms(rooms).map((r) => r.status.room.name)).toEqual(['102', '101', '103'])
  })
})
