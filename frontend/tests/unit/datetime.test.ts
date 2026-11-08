import { describe, expect, it } from 'vitest'
import { formatClock } from '@/shared/lib/datetime'

// Giờ Việt Nam = UTC+7.
const now = new Date('2026-11-09T08:00:00Z') // 15:00 ngày 09/11 giờ VN

describe('thời gian đến phút', () => {
  it('cùng ngày chỉ hiện giờ:phút', () => {
    expect(formatClock('2026-11-09T07:58:37Z', now)).toBe('14:58')
  })

  it('khác ngày thì thêm ngày/tháng', () => {
    expect(formatClock('2026-11-08T16:30:00Z', now)).toBe('08/11 23:30')
  })
})
