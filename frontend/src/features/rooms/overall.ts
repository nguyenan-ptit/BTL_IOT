import type { RoomOverall } from '@/shared/schemas/common'
import type { RoomStatus } from './schemas'

/**
 * Trạng thái tổng của phòng (FR-007, data-model.md). Gặp điều kiện nào trước thì lấy:
 * chưa có thiết bị > cảnh báo > bảo trì > mất kết nối > lỗi cảm biến > bình thường.
 */
export function computeRoomOverall(status: RoomStatus): RoomOverall {
  const { node } = status
  if (!node || node.lifecycle === 'registered' || node.lifecycle === 'retired') return 'no_device'
  if (status.activeIncidentId !== null || status.hazardSigns.length > 0) return 'alarm'
  if (node.lifecycle === 'maintenance') return 'maintenance'
  if (node.connectivity === 'offline') return 'offline'
  if (status.sensors.some((s) => s.health === 'fault')) return 'sensor_fault'
  return 'normal'
}

const ORDER: RoomOverall[] = [
  'alarm',
  'offline',
  'sensor_fault',
  'maintenance',
  'normal',
  'no_device',
]

/** Phòng có chuyện lên đầu, rồi theo tên phòng. */
export function sortRooms<T extends { overall: RoomOverall; status: RoomStatus }>(rooms: T[]): T[] {
  return [...rooms].sort(
    (a, b) =>
      ORDER.indexOf(a.overall) - ORDER.indexOf(b.overall) ||
      a.status.room.name.localeCompare(b.status.room.name, 'vi', { numeric: true }),
  )
}
