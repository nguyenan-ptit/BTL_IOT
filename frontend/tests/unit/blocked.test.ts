import { describe, expect, it } from 'vitest'
import { activityOf } from '@/features/rooms/activity'
import { computeRoomOverall } from '@/features/rooms/overall'
import type { RoomStatus } from '@/features/rooms/schemas'

const noNode: RoomStatus = {
  room: { id: '101', name: 'Phòng 101', boardingHouseId: '1' },
  node: null,
  sensors: [],
  activeIncidentId: null,
  hazardSigns: [],
}

describe('node bị quản trị viên khoá', () => {
  it('phòng có node bị khoá hiện "Tạm khoá", không phải "Chưa có thiết bị"', () => {
    expect(computeRoomOverall(noNode, null, true)).toBe('blocked')
    expect(computeRoomOverall(noNode, null, false)).toBe('no_device')
  })

  it('trang admin: khoá, bảo trì, ngừng sử dụng không bị tính là mất kết nối', () => {
    const base = { online: false, lastSeenAt: '2026-11-09T08:00:00+00:00' }
    expect(activityOf({ ...base, lifecycle: 'blocked' })).toBe('blocked')
    expect(activityOf({ ...base, lifecycle: 'maintenance' })).toBe('maintenance')
    expect(activityOf({ ...base, lifecycle: 'decommissioned' })).toBe('retired')
    expect(activityOf({ ...base, lifecycle: 'active' })).toBe('offline')
    expect(activityOf({ ...base, lifecycle: 'active', online: true })).toBe('online')
    expect(activityOf({ online: false, lastSeenAt: null, lifecycle: 'registered' })).toBe('never')
  })
})
