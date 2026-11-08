import { z } from 'zod'

// Dữ liệu thô từ các route của Long: GET /api/devices, GET /api/history, lệnh điều khiển.
// Tên trường giữ snake_case như backend; adapters.ts chuyển sang kiểu của website.

/** Telemetry firmware schema 6 (docs/MQTT_CONTRACT.md mục 2). Chỉ khai báo các trường website dùng. */
export const telemetrySchema = z.looseObject({
  device_id: z.string(),
  boot_id: z.string(),
  seq: z.number().int(),
  system_state: z.string(),
  temperature: z.looseObject({
    value_c: z.number().nullable(),
    health: z.string(),
    alarm: z.boolean(),
  }),
  mq2: z.looseObject({
    adc_raw: z.number().int().nullable(),
    adc_on: z.number().int(),
    adc_off: z.number().int(),
    health: z.string(),
    alarm: z.boolean(),
  }),
  flame: z.looseObject({
    health: z.string(),
    alarm: z.boolean().nullable(),
  }),
  limits: z.looseObject({
    temperature_on_c: z.number(),
    temperature_off_c: z.number(),
  }),
  // Tuỳ chọn: chỉ có khi bộ lưu ngưỡng của firmware sẵn sàng.
  remote_config: z
    .looseObject({
      version: z.number().int(),
      revision: z.number().int(),
      last_request_id: z.string(),
    })
    .optional(),
  buzzer_test: z
    .looseObject({ command_seq: z.number().int(), status: z.string(), active: z.boolean() })
    .optional(),
})
export type Telemetry = z.infer<typeof telemetrySchema>

export const deviceLifecycleSchema = z.enum([
  'registered',
  'provisioned',
  'active',
  'maintenance',
  'blocked',
  'decommissioned',
])
export type DeviceLifecycle = z.infer<typeof deviceLifecycleSchema>

export const credentialStatusSchema = z.enum(['pending', 'active', 'revoked'])
export type CredentialStatus = z.infer<typeof credentialStatusSchema>

export const mqttSyncStatusSchema = z.enum(['unknown', 'pending', 'synced', 'failed'])
export type MqttSyncStatus = z.infer<typeof mqttSyncStatusSchema>

/** Trạng thái lệnh điều khiển (bảng "Trạng thái lệnh" trong docs/LONG_API.md). */
export const commandStatusSchema = z.enum([
  'queued',
  'pending',
  'unconfirmed',
  'running',
  'applied',
  'completed',
  'stopped',
  'blocked',
  'interrupted',
  'superseded',
  'timeout',
  'failed',
])
export type CommandStatus = z.infer<typeof commandStatusSchema>

export const thresholdPayloadSchema = z.object({
  mq2_on: z.number(),
  mq2_off: z.number(),
  temperature_on_c: z.number(),
  temperature_off_c: z.number(),
})
export type ThresholdPayload = z.infer<typeof thresholdPayloadSchema>

export const thresholdCommandSchema = z.looseObject({
  request_id: z.string(),
  status: commandStatusSchema,
  thresholds: thresholdPayloadSchema,
  message: z.string(),
})
export type ThresholdCommand = z.infer<typeof thresholdCommandSchema>

export const buzzerCommandSchema = z.looseObject({
  request_id: z.string(),
  action: z.enum(['start', 'stop']),
  status: commandStatusSchema,
  message: z.string(),
})
export type BuzzerCommand = z.infer<typeof buzzerCommandSchema>

/** Bản ghi registry trong `devices` (public_row của backend). */
export const deviceRegistrySchema = z.looseObject({
  device_id: z.string(),
  device_name: z.string(),
  mqtt_username: z.string(),
  mqtt_client_id: z.string().nullable(),
  mqtt_sync_status: mqttSyncStatusSchema,
  mqtt_operation_id: z.string().nullable(),
  hardware_version: z.string().nullable(),
  firmware_version: z.string().nullable(),
  last_seen_at: z.string().nullable(),
  maintenance_note: z.string().nullable(),
})
export type DeviceRegistry = z.infer<typeof deviceRegistrySchema>

const controlSnapshot = <T extends z.ZodType>(command: T) =>
  z.object({ supported: z.boolean(), pending: command.nullable() })

export const deviceItemSchema = z.looseObject({
  device_id: z.string(),
  room_id: z.string().nullable(),
  lifecycle_status: deviceLifecycleSchema,
  credential_status: credentialStatusSchema,
  data: telemetrySchema.nullable(),
  online: z.boolean(),
  received_at: z.string().nullable(),
  can_control: z.boolean(),
  device: deviceRegistrySchema,
  remote_control: controlSnapshot(thresholdCommandSchema),
  buzzer_control: controlSnapshot(buzzerCommandSchema),
})
export type DeviceItem = z.infer<typeof deviceItemSchema>

export const deviceListSchema = z.looseObject({ items: z.array(deviceItemSchema) })

export const historySampleSchema = z.object({
  received_at: z.string(),
  room_id: z.string().nullable(),
  data: telemetrySchema,
})
export type HistorySample = z.infer<typeof historySampleSchema>
