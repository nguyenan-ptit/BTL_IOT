import type { RoomOverall } from '@/shared/schemas/common'
import type { RoomStatus } from './schemas'
import { isFault, roomNodeViews } from './sensors'

/**
 * Cảnh báo thuộc về phòng. Với các trạng thái còn lại, xét các node đang giám sát trước.
 */
export function computeRoomOverall(status: RoomStatus, nodes = roomNodeViews(status)): RoomOverall {
  if (status.activeIncidentId !== null || status.hazardSigns.length > 0) return 'alarm'
  const active = nodes.filter((node) => node.lifecycle === 'active')
  if (active.some((node) => node.connectivity === 'offline')) return 'offline'
  if (active.some((node) => node.sensors.some((sensor) => isFault(sensor.state))))
    return 'sensor_fault'
  if (active.length > 0) return 'normal'
  if (nodes.some((node) => node.lifecycle === 'maintenance')) return 'maintenance'
  if (nodes.some((node) => node.lifecycle === 'blocked')) return 'blocked'
  return 'no_device'
}

const ORDER: RoomOverall[] = [
  'alarm',
  'offline',
  'sensor_fault',
  'maintenance',
  'blocked',
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

/**
 * Thứ tự cho thẻ nhà trọ: sự cố trước, rồi bình thường. Bảo trì và tạm khoá do admin chủ động đặt,
 * nên chỉ hiện khi cả nhà không còn phòng nào đang hoạt động.
 */
const HOUSE_ORDER: RoomOverall[] = [
  'alarm',
  'offline',
  'sensor_fault',
  'normal',
  'maintenance',
  'blocked',
  'no_device',
]

/** Trạng thái đại diện cho một nhóm phòng (để gắn tag thẻ nhà trọ). */
export function worstOverall(list: RoomOverall[]): RoomOverall {
  return HOUSE_ORDER.find((o) => list.includes(o)) ?? 'no_device'
}

/** Số phòng theo từng trạng thái, theo thứ tự ưu tiên; bỏ trạng thái không có phòng nào. */
export function countByOverall(list: RoomOverall[]): [RoomOverall, number][] {
  return ORDER.map((o) => [o, list.filter((x) => x === o).length] as [RoomOverall, number]).filter(
    ([, n]) => n > 0,
  )
}
