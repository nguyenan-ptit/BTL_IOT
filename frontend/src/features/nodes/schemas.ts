import { z } from 'zod'
import type {
  CredentialStatus,
  DeviceItem,
  DeviceLifecycle,
  MqttSyncStatus,
} from '@/features/devices/schemas'
import type { Connectivity } from '@/shared/schemas/common'

/** Một dòng trong bảng quản lý node, dựng từ item của GET /api/devices. */
export type NodeListItem = {
  id: string
  name: string
  roomId: string | null
  roomName: string | null
  lifecycle: DeviceLifecycle
  credential: CredentialStatus
  mqttSync: MqttSyncStatus
  connectivity: Connectivity
  lastSeenAt: string | null
  operationId: string | null
  maintenanceNote: string | null
}

export function toNodeListItem(item: DeviceItem, roomNames: Map<string, string>): NodeListItem {
  return {
    id: item.device_id,
    name: item.device.device_name,
    roomId: item.room_id,
    roomName: item.room_id ? (roomNames.get(item.room_id) ?? item.room_id) : null,
    lifecycle: item.lifecycle_status,
    credential: item.credential_status,
    mqttSync: item.device.mqtt_sync_status,
    connectivity: item.online ? 'online' : 'offline',
    lastSeenAt: item.device.last_seen_at,
    operationId: item.device.mqtt_operation_id,
    maintenanceNote: item.device.maintenance_note,
  }
}

/** Chuỗi rỗng ở trường tuỳ chọn thành undefined, JSON.stringify bỏ khỏi body (backend cấm chuỗi rỗng). */
const optional = (max: number, message: string) =>
  z
    .string()
    .trim()
    .max(max, message)
    .optional()
    .transform((v) => (v ? v : undefined))

// Theo RegisterRequest trong backend/app/api/routes/devices.py.
export const registerNodeFormSchema = z.object({
  device_id: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9_-]{1,32}$/, 'Mã node gồm 1–32 ký tự chữ, số, gạch dưới hoặc gạch ngang.'),
  device_name: z.string().trim().min(1, 'Nhập tên node.').max(100, 'Tên node tối đa 100 ký tự.'),
  room_id: z.string().min(1, 'Chọn phòng gắn node.'),
  mqtt_username: z
    .string()
    .trim()
    .regex(
      /^[A-Za-z0-9_-]{1,64}$/,
      'Tên tài khoản MQTT gồm 1–64 ký tự chữ, số, gạch dưới hoặc gạch ngang.',
    ),
  mqtt_client_id: optional(128, 'Client ID tối đa 128 ký tự.'),
  board_model: optional(64, 'Loại bo mạch tối đa 64 ký tự.'),
  hardware_version: optional(32, 'Phiên bản phần cứng tối đa 32 ký tự.'),
  firmware_version: optional(64, 'Phiên bản firmware tối đa 64 ký tự.'),
})
export type RegisterNodeInput = z.input<typeof registerNodeFormSchema>
export type RegisterNodeBody = z.output<typeof registerNodeFormSchema>

/** Ghi chú khi chuyển bảo trì (maintenance_note của backend tối đa 500 ký tự). */
export const maintenanceNoteSchema = z.string().trim().max(500, 'Ghi chú tối đa 500 ký tự.')

/** Một dòng lịch sử lệnh (GET /api/devices/{id}/commands). */
export const nodeCommandSchema = z.looseObject({
  request_id: z.string(),
  command_type: z.string(),
  status: z.string(),
  requested_at: z.string(),
  finished_at: z.string().nullable(),
  error_message: z.string().nullable(),
})
export type NodeCommand = z.infer<typeof nodeCommandSchema>

/** Node mới đang chờ cấp tài khoản MQTT lần đầu: điều kiện của API attach-existing. */
export function canAttachExistingMqtt(node: NodeListItem): boolean {
  return (
    (node.lifecycle === 'registered' || node.lifecycle === 'provisioned') &&
    node.credential === 'pending' &&
    node.mqttSync === 'unknown' &&
    node.operationId === null
  )
}

const mustCheck = (message: string) => z.boolean().refine((v) => v, { message })

/** Form "Xác nhận tài khoản MQTT có sẵn" (AttachExistingMqttRequest của backend). */
export const attachMqttFormSchema = z.object({
  connection_checked: mustCheck('Xác nhận đã kiểm tra ESP kết nối bằng đúng tài khoản.'),
  topic_permissions_checked: mustCheck('Xác nhận đã kiểm tra quyền topic của node.'),
  verification_note: z
    .string()
    .trim()
    .min(10, 'Ghi rõ kết quả kiểm tra, ít nhất 10 ký tự.')
    .max(500, 'Ghi chú tối đa 500 ký tự.'),
})
export type AttachMqttForm = z.infer<typeof attachMqttFormSchema>
