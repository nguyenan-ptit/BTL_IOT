import { z } from 'zod'

// Ngưỡng bật/tắt cảnh báo của một node, theo model Thresholds của backend
// (backend/app/integrations/mqtt/remote_control.py). Gas là số ADC thô của MQ-2, không phải ppm.
export const GAS_ON_RANGE = { min: 1, max: 1023 } as const
export const GAS_OFF_RANGE = { min: 0, max: 1022 } as const
export const TEMP_RANGE = { min: -55, max: 125 } as const

const gas = (range: { min: number; max: number }) =>
  z
    .number({ error: 'Nhập một số.' })
    .int('Ngưỡng gas là số nguyên.')
    .min(range.min, `Ngưỡng gas từ ${range.min} đến ${range.max}.`)
    .max(range.max, `Ngưỡng gas từ ${range.min} đến ${range.max}.`)

const temp = z
  .number({ error: 'Nhập một số.' })
  .min(TEMP_RANGE.min, `Nhiệt độ từ ${TEMP_RANGE.min} đến ${TEMP_RANGE.max} °C.`)
  .max(TEMP_RANGE.max, `Nhiệt độ từ ${TEMP_RANGE.min} đến ${TEMP_RANGE.max} °C.`)
  .refine(
    (v) => Math.abs(v * 10 - Math.round(v * 10)) < 1e-9,
    'Nhiệt độ dùng tối đa một chữ số thập phân.',
  )

const shape = z.object({
  gasOn: gas(GAS_ON_RANGE),
  gasOff: gas(GAS_OFF_RANGE),
  tempOn: temp,
  tempOff: temp,
})

export type ThresholdValues = z.infer<typeof shape>

/** Form sửa ngưỡng: ngưỡng tắt phải nhỏ hơn ngưỡng bật (chống bật tắt liên tục). */
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
