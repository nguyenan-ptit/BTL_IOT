import { z } from 'zod'
import { dateTimeSchema } from '@/shared/schemas/common'

export const measurementSchema = z.object({
  measuredAt: dateTimeSchema,
  receivedAt: dateTimeSchema,
  gas: z.number().nullable(),
  temperature: z.number().nullable(),
  flame: z.boolean().nullable(),
})
export type Measurement = z.infer<typeof measurementSchema>
