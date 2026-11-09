import { describe, expect, it } from 'vitest'
import { countByOverall, worstOverall } from '@/features/rooms/overall'

describe('tóm tắt một nhà trọ', () => {
  it('lấy trạng thái nặng nhất theo thứ tự ưu tiên của web', () => {
    expect(worstOverall(['normal', 'offline', 'alarm'])).toBe('alarm')
    expect(worstOverall(['normal', 'blocked'])).toBe('blocked')
    expect(worstOverall(['normal', 'no_device'])).toBe('normal')
    expect(worstOverall([])).toBe('no_device')
  })

  it('đếm số phòng theo trạng thái, bỏ trạng thái không có phòng nào', () => {
    expect(countByOverall(['normal', 'alarm', 'normal'])).toEqual([
      ['alarm', 1],
      ['normal', 2],
    ])
  })
})
