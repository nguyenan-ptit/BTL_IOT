import { z } from 'zod'
import { actorSchema, dateTimeSchema } from '@/shared/schemas/common'

// Ngưỡng bật/tắt cảnh báo theo phòng (US7, FR-040). Gas là số ADC thô của MQ-2, không phải ppm.
export const GAS_RANGE = { min: 0, max: 1023 } as const
export const TEMP_RANGE = { min: -55, max: 125 } as const

const gas = z
  .number({ error: 'Nhập một số.' })
  .int('Ngưỡng gas là số nguyên.')
  .min(GAS_RANGE.min, `Ngưỡng gas từ ${GAS_RANGE.min} đến ${GAS_RANGE.max}.`)
  .max(GAS_RANGE.max, `Ngưỡng gas từ ${GAS_RANGE.min} đến ${GAS_RANGE.max}.`)

const temp = z
  .number({ error: 'Nhập một số.' })
  .min(TEMP_RANGE.min, `Nhiệt độ từ ${TEMP_RANGE.min} đến ${TEMP_RANGE.max} °C.`)
  .max(TEMP_RANGE.max, `Nhiệt độ từ ${TEMP_RANGE.min} đến ${TEMP_RANGE.max} °C.`)
  .multipleOf(0.5, 'Nhiệt độ theo bước 0,5 °C.')

const shape = z.object({ gasOn: gas, gasOff: gas, tempOn: temp, tempOff: temp })

/** Dữ liệu ngưỡng như API trả về: chỉ kiểm tra kiểu. */
export const thresholdValuesSchema = shape
export type ThresholdValues = z.infer<typeof thresholdValuesSchema>

/** Form sửa ngưỡng: thêm điều kiện ngưỡng tắt nhỏ hơn ngưỡng bật (chống bật tắt liên tục). */
export const thresholdFormSchema = shape.superRefine((v, ctx) => {
  if (v.gasOff >= v.gasOn) {
    ctx.addIssue({
      code: 'custom',
      path: ['gasOff'],
      message: 'Ngưỡng tắt phải nhỏ hơn ngưỡng bật.',
    })
  }
  if (v.tempOff >= v.tempOn) {
    ctx.addIssue({
      code: 'custom',
      path: ['tempOff'],
      message: 'Ngưỡng tắt phải nhỏ hơn ngưỡng bật.',
    })
  }
})

export const syncStateSchema = z.enum(['applied', 'pending', 'unreachable'])
export type SyncState = z.infer<typeof syncStateSchema>

export const roomThresholdSchema = z.object({
  roomId: z.string(),
  roomName: z.string(),
  desired: thresholdValuesSchema,
  reported: thresholdValuesSchema.nullable(),
  sync: syncStateSchema,
  updatedAt: dateTimeSchema.nullable(),
  updatedBy: actorSchema.nullable(),
})
export type RoomThreshold = z.infer<typeof roomThresholdSchema>

export function sameValues(a: ThresholdValues | null, b: ThresholdValues | null): boolean {
  return (
    !!a &&
    !!b &&
    a.gasOn === b.gasOn &&
    a.gasOff === b.gasOff &&
    a.tempOn === b.tempOn &&
    a.tempOff === b.tempOff
  )
}
