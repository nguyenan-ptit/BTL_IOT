import { z } from 'zod'
import { dateTimeSchema } from '@/shared/schemas/common'

export const measurementSchema = z.object({
  measuredAt: dateTimeSchema,
  receivedAt: dateTimeSchema,
  isBackfill: z.boolean(),
  gas: z.number().nullable(),
  temperature: z.number().nullable(),
  flame: z.boolean().nullable(),
})
export type Measurement = z.infer<typeof measurementSchema>

export const bucketSchema = z.enum(['raw', '1m', '5m', '1h'])
export type Bucket = z.infer<typeof bucketSchema>

export const measurementHistorySchema = z.object({
  measurements: z.array(measurementSchema),
  incidents: z.array(
    z.object({ id: z.string(), startedAt: dateTimeSchema, resolvedAt: dateTimeSchema.nullable() }),
  ),
  offlineRanges: z.array(z.object({ from: dateTimeSchema, to: dateTimeSchema })),
})
export type MeasurementHistory = z.infer<typeof measurementHistorySchema>
