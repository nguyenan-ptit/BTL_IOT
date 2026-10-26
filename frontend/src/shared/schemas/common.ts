import { z } from 'zod'

// Thời điểm ISO 8601 có múi giờ, ví dụ 2026-10-26T14:30:00+07:00.
export const dateTimeSchema = z.iso.datetime({ offset: true })

export const roleSchema = z.enum(['admin', 'landlord', 'tenant'])
export type Role = z.infer<typeof roleSchema>

export const nodeLifecycleSchema = z.enum(['registered', 'active', 'maintenance', 'retired'])
export type NodeLifecycle = z.infer<typeof nodeLifecycleSchema>

export const connectivitySchema = z.enum(['online', 'offline'])
export type Connectivity = z.infer<typeof connectivitySchema>

export const sensorKindSchema = z.enum(['gas', 'temperature', 'flame'])
export type SensorKind = z.infer<typeof sensorKindSchema>

export const sensorHealthSchema = z.enum(['ok', 'fault'])
export type SensorHealth = z.infer<typeof sensorHealthSchema>

export const hazardSignSchema = z.enum(['gas', 'high_temperature', 'flame'])
export type HazardSign = z.infer<typeof hazardSignSchema>

export const incidentStatusSchema = z.enum(['open', 'acknowledged', 'resolved'])
export type IncidentStatus = z.infer<typeof incidentStatusSchema>

export const auditActionSchema = z.enum([
  'user_created',
  'user_updated',
  'user_locked',
  'user_unlocked',
  'node_registered',
  'node_assigned',
  'node_transitioned',
  'incident_acknowledged',
])
export type AuditAction = z.infer<typeof auditActionSchema>

// Trạng thái tổng của phòng do frontend tự tính (data-model.md, FR-007).
export const roomOverallSchema = z.enum([
  'no_device',
  'alarm',
  'maintenance',
  'offline',
  'sensor_fault',
  'normal',
])
export type RoomOverall = z.infer<typeof roomOverallSchema>

export const actorSchema = z.object({ id: z.string(), displayName: z.string() })
export type Actor = z.infer<typeof actorSchema>

export function pageSchema<T extends z.ZodType>(item: T) {
  return z.object({
    items: z.array(item),
    total: z.number().int().nonnegative(),
    page: z.number().int().positive(),
    pageSize: z.number().int().positive(),
  })
}
export type Page<T> = { items: T[]; total: number; page: number; pageSize: number }

export const apiErrorSchema = z.object({
  code: z.string(),
  message: z.string(),
  fields: z.record(z.string(), z.string()).optional(),
})
export type ApiErrorBody = z.infer<typeof apiErrorSchema>
