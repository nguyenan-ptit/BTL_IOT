import { z } from 'zod'
import {
  connectivitySchema,
  dateTimeSchema,
  hazardSignSchema,
  nodeLifecycleSchema,
  sensorHealthSchema,
} from '@/shared/schemas/common'

export const boardingHouseSchema = z.object({
  id: z.string(),
  name: z.string(),
  landlordId: z.string().nullable(),
})
export type BoardingHouse = z.infer<typeof boardingHouseSchema>

export const roomSchema = z.object({
  id: z.string(),
  boardingHouseId: z.string(),
  name: z.string(),
  activeNodeId: z.string().nullable(),
})
export type Room = z.infer<typeof roomSchema>

// Ba loại cảm biến có kiểu giá trị khác nhau nên tách theo `kind`.
export const sensorReadingSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('gas'), health: sensorHealthSchema, value: z.number().nullable() }),
  z.object({
    kind: z.literal('temperature'),
    health: sensorHealthSchema,
    value: z.number().nullable(),
  }),
  z.object({ kind: z.literal('flame'), health: sensorHealthSchema, value: z.boolean().nullable() }),
])
export type SensorReading = z.infer<typeof sensorReadingSchema>

export const roomNodeSummarySchema = z.object({
  id: z.string(),
  code: z.string(),
  lifecycle: nodeLifecycleSchema,
  connectivity: connectivitySchema,
  lastSeenAt: dateTimeSchema.nullable(),
})

export const roomStatusSchema = z.object({
  room: roomSchema.pick({ id: true, name: true, boardingHouseId: true }),
  node: roomNodeSummarySchema.nullable(),
  sensors: z.array(sensorReadingSchema),
  activeIncidentId: z.string().nullable(),
  hazardSigns: z.array(hazardSignSchema),
})
export type RoomStatus = z.infer<typeof roomStatusSchema>
