import { z } from 'zod'
import { measurementSchema } from '@/features/history/schemas'
import {
  actorSchema,
  dateTimeSchema,
  hazardSignSchema,
  incidentStatusSchema,
  roleSchema,
} from '@/shared/schemas/common'

export const acknowledgementSchema = z.object({
  user: actorSchema.extend({ role: roleSchema }),
  at: dateTimeSchema,
})
export type Acknowledgement = z.infer<typeof acknowledgementSchema>

export const incidentSchema = z.object({
  id: z.string(),
  roomId: z.string(),
  roomName: z.string(),
  // Backend có thể trả mảng rỗng khi không suy ra được dấu hiệu từ loại cảnh báo.
  signs: z.array(hazardSignSchema),
  status: incidentStatusSchema,
  startedAt: dateTimeSchema,
  resolvedAt: dateTimeSchema.nullable(),
  /** Cảm biến báo đã về bình thường. */
  recoveredAt: dateTimeSchema.nullable(),
  /** Người dùng đã đóng sự cố (POST /resolve). */
  closedAt: dateTimeSchema.nullable(),
  closedBy: actorSchema.nullable(),
  firstMeasurement: measurementSchema,
  latestMeasurement: measurementSchema,
  acknowledgements: z.array(acknowledgementSchema),
  acknowledgedByMe: z.boolean(),
})
export type Incident = z.infer<typeof incidentSchema>

/** Backend chỉ cho đóng sự cố sau khi cảm biến báo đã khôi phục. */
export function canResolve(incident: Incident): boolean {
  return incident.recoveredAt !== null && incident.closedAt === null
}

export const incidentTimelineEntrySchema = z.object({
  at: dateTimeSchema,
  kind: z.enum(['detected', 'updated', 'acknowledged', 'resolved']),
  measurement: measurementSchema.nullable(),
  actor: actorSchema.nullable(),
  count: z.number().int().positive(),
})
export type IncidentTimelineEntry = z.infer<typeof incidentTimelineEntrySchema>

export const incidentDetailSchema = incidentSchema.extend({
  timeline: z.array(incidentTimelineEntrySchema),
})
export type IncidentDetail = z.infer<typeof incidentDetailSchema>
