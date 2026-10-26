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
  signs: z.array(hazardSignSchema).min(1),
  status: incidentStatusSchema,
  startedAt: dateTimeSchema,
  resolvedAt: dateTimeSchema.nullable(),
  firstMeasurement: measurementSchema,
  latestMeasurement: measurementSchema,
  acknowledgements: z.array(acknowledgementSchema),
  acknowledgedByMe: z.boolean(),
})
export type Incident = z.infer<typeof incidentSchema>

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
