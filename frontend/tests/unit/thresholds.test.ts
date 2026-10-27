import { describe, expect, it } from 'vitest'
import { sameValues, thresholdFormSchema } from '@/features/thresholds/schemas'

const ok = { gasOn: 400, gasOff: 350, tempOn: 60, tempOff: 55 }

describe('form ngưỡng cảnh báo', () => {
  it('nhận bộ ngưỡng hợp lệ', () => {
    expect(thresholdFormSchema.safeParse(ok).success).toBe(true)
  })

  it('chặn ngưỡng tắt lớn hơn hoặc bằng ngưỡng bật', () => {
    const r = thresholdFormSchema.safeParse({ ...ok, gasOff: 400, tempOff: 61 })
    expect(r.success).toBe(false)
    const paths = r.error?.issues.map((i) => i.path.join('.'))
    expect(paths).toEqual(expect.arrayContaining(['gasOff', 'tempOff']))
  })

  it('chặn gas ngoài 0–1023 hoặc không nguyên', () => {
    expect(thresholdFormSchema.safeParse({ ...ok, gasOn: 1024 }).success).toBe(false)
    expect(thresholdFormSchema.safeParse({ ...ok, gasOn: 400.5 }).success).toBe(false)
  })

  it('nhiệt độ theo bước 0,5 °C trong -55–125', () => {
    expect(thresholdFormSchema.safeParse({ ...ok, tempOn: 60.5 }).success).toBe(true)
    expect(thresholdFormSchema.safeParse({ ...ok, tempOn: 60.3 }).success).toBe(false)
    expect(thresholdFormSchema.safeParse({ ...ok, tempOn: 130 }).success).toBe(false)
  })

  it('so sánh hai bộ ngưỡng', () => {
    expect(sameValues(ok, { ...ok })).toBe(true)
    expect(sameValues(ok, { ...ok, gasOn: 401 })).toBe(false)
    expect(sameValues(ok, null)).toBe(false)
  })
})
