import { z } from 'zod'

// Thao tác MQTT do backend trả về khi ngừng sử dụng node (PATCH /lifecycle chạy luồng thu hồi).
// Cấu trúc theo _public() trong backend/app/services/mqtt_lifecycle.py và bảng mqtt_operations.
export const mqttOperationSchema = z.looseObject({
  operation_id: z.string().regex(/^[0-9a-f]{32}$/),
  device_id: z.string(),
  action: z.enum(['provision', 'reissue', 'revoke']),
  status: z.enum(['processing', 'succeeded', 'incomplete']),
  target_username: z.string().nullable(),
  steps: z.record(z.string(), z.string()),
  error_code: z.string().nullable(),
  message: z.string(),
  created_at: z.string(),
  finished_at: z.string().nullable(),
})
export type MqttOperation = z.infer<typeof mqttOperationSchema>
