import { z } from 'zod'
import { dateTimeSchema } from '@/shared/schemas/common'

export const measurementSchema = z.object({
  measuredAt: dateTimeSchema,
  receivedAt: dateTimeSchema,
  /** Số đo được node gửi bù sau khi mất mạng (đo trước, nhận sau). */
  isBackfill: z.boolean().default(false),
  gas: z.number().nullable(),
  temperature: z.number().nullable(),
  flame: z.boolean().nullable(),
})
export type Measurement = z.infer<typeof measurementSchema>
