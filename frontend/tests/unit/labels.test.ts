import { describe, expect, it } from 'vitest'
import { roomNumber } from '@/shared/lib/labels'

// Backend đặt tên phòng dạng "Phòng 101"; giao diện tự thêm chữ "Phòng" nên cần bỏ phần lặp.
describe('tên phòng', () => {
  it('bỏ chữ "Phòng" ở đầu tên', () => {
    expect(roomNumber('Phòng 101')).toBe('101')
    expect(roomNumber('phòng  A2')).toBe('A2')
  })

  it('giữ nguyên tên không có chữ "Phòng"', () => {
    expect(roomNumber('101')).toBe('101')
    expect(roomNumber('Phòngkho')).toBe('Phòngkho')
  })
})
