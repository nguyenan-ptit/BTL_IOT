import { z } from 'zod'
import {
  actorSchema,
  connectivitySchema,
  dateTimeSchema,
  nodeLifecycleSchema,
} from '@/shared/schemas/common'

export const nodeSchema = z.object({
  id: z.string(),
  code: z.string(),
  roomId: z.string().nullable(),
  lifecycle: nodeLifecycleSchema,
  connectivity: connectivitySchema,
  lastSeenAt: dateTimeSchema.nullable(),
})
export type Node = z.infer<typeof nodeSchema>

export const nodeListItemSchema = nodeSchema.extend({ roomName: z.string().nullable() })
export type NodeListItem = z.infer<typeof nodeListItemSchema>

export const nodeActionSchema = z.enum(['activate', 'maintain', 'retire'])
export type NodeAction = z.infer<typeof nodeActionSchema>

export const nodeHistoryEntrySchema = z.object({
  id: z.string(),
  nodeId: z.string(),
  at: dateTimeSchema,
  actor: actorSchema,
  kind: z.enum(['registered', 'assigned', 'transitioned']),
  fromLifecycle: nodeLifecycleSchema.nullable(),
  toLifecycle: nodeLifecycleSchema.nullable(),
  fromRoomId: z.string().nullable(),
  toRoomId: z.string().nullable(),
})
export type NodeHistoryEntry = z.infer<typeof nodeHistoryEntrySchema>

export const registerNodeFormSchema = z.object({
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(
      /^[A-Z0-9-]{3,32}$/,
      'Mã node gồm 3–32 ký tự chữ, số hoặc dấu gạch ngang, ví dụ NODE-103.',
    ),
  roomId: z.string(),
})
export type RegisterNodeForm = z.infer<typeof registerNodeFormSchema>
