import { z } from 'zod'
import { actorSchema, auditActionSchema, dateTimeSchema } from '@/shared/schemas/common'

export const auditLogEntrySchema = z.object({
  id: z.string(),
  at: dateTimeSchema,
  actor: actorSchema,
  action: auditActionSchema,
  target: z.object({
    type: z.enum(['user', 'node', 'incident', 'room']),
    id: z.string(),
    label: z.string(),
  }),
  summary: z.string(),
})
export type AuditLogEntry = z.infer<typeof auditLogEntrySchema>
