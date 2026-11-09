import { z } from 'zod'
import { deviceLifecycleSchema, type DeviceLifecycle } from '@/features/devices/schemas'
import { request } from '@/shared/api/http'
import { mqttOperationSchema } from './mqtt'
import { nodeCommandSchema, type RegisterNodeBody } from './schemas'

export const NODE_PAGE_SIZE = 20

const base = (id: string) => `/api/devices/${encodeURIComponent(id)}`

export function registerNode(body: RegisterNodeBody) {
  return request('/api/devices/register', z.looseObject({ device_id: z.string() }), {
    method: 'POST',
    body,
  })
}

/** Backend bắt buộc có phòng; không có "bỏ gán". */
export function moveNode(id: string, roomId: string) {
  return request(`${base(id)}/room`, z.looseObject({}), {
    method: 'PATCH',
    body: { room_id: roomId },
  })
}

const lifecycleResultSchema = z.looseObject({
  device_id: z.string(),
  lifecycle_status: deviceLifecycleSchema,
})

/**
 * Đổi vòng đời. Ngừng sử dụng chạy luồng thu hồi MQTT và trả về thao tác MQTT
 * (`202 + incomplete` khi EMQX chưa xong), không phải kết quả vòng đời.
 */
export function changeLifecycle(
  id: string,
  body: { lifecycle_status: DeviceLifecycle; maintenance_note?: string },
) {
  return request(`${base(id)}/lifecycle`, z.union([lifecycleResultSchema, mqttOperationSchema]), {
    method: 'PATCH',
    body,
  })
}

export async function fetchNodeCommands(id: string, signal?: AbortSignal) {
  const result = await request(
    `${base(id)}/commands`,
    z.object({ items: z.array(nodeCommandSchema) }),
    { query: { limit: 20 }, signal },
  )
  return result.items
}

/** Admin xác nhận tài khoản MQTT đã tạo sẵn trên EMQX cho node mới (không cấp tài khoản mới). */
export function attachExistingMqtt(
  id: string,
  body: {
    mqtt_username: string
    connection_checked: boolean
    topic_permissions_checked: boolean
    verification_note: string
  },
) {
  return request(
    `${base(id)}/mqtt-credentials/attach-existing`,
    z.looseObject({ device_id: z.string(), mqtt_sync_status: z.string() }),
    { method: 'POST', body },
  )
}
