import type { Telemetry } from '@/features/devices/schemas'
import type { RoomOverall } from '@/shared/schemas/common'
import type { RoomStatus } from './schemas'
import { isFault, sensorViews } from './sensors'

/**
 * Trạng thái tổng của phòng (FR-007, data-model.md). Gặp điều kiện nào trước thì lấy:
 * chưa có thiết bị > cảnh báo > bảo trì > mất kết nối > lỗi cảm biến > bình thường.
 * `telemetry` (từ /api/devices) giúp phân biệt MQ-2 đang làm nóng với lỗi thật.
 */
export function computeRoomOverall(
  status: RoomStatus,
  telemetry: Telemetry | null = null,
  /** Phòng có node đang bị khoá (/api/rooms/status không trả node bị khoá). */
  blockedNode = false,
): RoomOverall {
  const { node } = status
  if (!node && blockedNode) return 'blocked'
  if (!node || node.lifecycle === 'registered' || node.lifecycle === 'retired') return 'no_device'
  if (status.activeIncidentId !== null || status.hazardSigns.length > 0) return 'alarm'
  if (node.lifecycle === 'maintenance') return 'maintenance'
  if (node.connectivity === 'offline') return 'offline'
  if (sensorViews(status, telemetry).some((s) => isFault(s.state))) return 'sensor_fault'
  return 'normal'
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
