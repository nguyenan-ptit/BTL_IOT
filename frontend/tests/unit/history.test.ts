import { describe, expect, it } from 'vitest'
import { telemetrySchema, type HistorySample } from '@/features/devices/schemas'
import { buildHistory, HISTORY_LIMIT } from '@/features/history/api'
import normal from '../fixtures/telemetry-normal.json'

const data = telemetrySchema.parse(normal)

function sample(second: number, adcOn = 60): HistorySample {
  return {
    received_at: new Date(Date.UTC(2026, 10, 8, 3, 0, second)).toISOString(),
    room_id: '101',
    data: { ...data, mq2: { ...data.mq2, adc_on: adcOn } },
  }
}

describe('dựng lịch sử từ /api/history', () => {
  it('đảo về cũ → mới và lấy ngưỡng từ mẫu mới nhất', () => {
    // Backend trả mới nhất trước.
    const result = buildHistory([sample(4, 70), sample(2), sample(0)])
    expect(result.measurements.map((m) => m.measuredAt)).toEqual([
      sample(0).received_at,
      sample(2).received_at,
      sample(4).received_at,
    ])
    expect(result.thresholds?.gasOn).toBe(70)
    expect(result.truncated).toBe(false)
  })

  it('đủ 100 mẫu thì báo đã cắt bớt', () => {
    const samples = Array.from({ length: HISTORY_LIMIT }, (_, i) => sample(HISTORY_LIMIT - i))
    expect(buildHistory(samples).truncated).toBe(true)
  })

  it('không có mẫu nào', () => {
    expect(buildHistory([])).toEqual({ measurements: [], thresholds: null, truncated: false })
  })
})
