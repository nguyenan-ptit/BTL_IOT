import { describe, expect, it } from 'vitest'
import { signsText } from '@/features/incidents/format'
import { canResolve, incidentDetailSchema } from '@/features/incidents/schemas'

const measurement = {
  measuredAt: '2026-11-08T03:00:00+00:00',
  receivedAt: '2026-11-08T03:00:00+00:00',
  isBackfill: false,
  gas: null,
  temperature: null,
  flame: null,
}

// Đúng hình _incident_public(detail=True) trong backend/app/api/routes/incidents.py.
const detail = {
  id: '42',
  roomId: '101',
  roomName: '101',
  signs: [],
  status: 'acknowledged',
  startedAt: '2026-11-08T03:00:00+00:00',
  resolvedAt: null,
  recoveredAt: null,
  closedAt: null,
  closedBy: null,
  firstMeasurement: measurement,
  latestMeasurement: measurement,
  acknowledgements: [
    {
      user: { id: '1002', displayName: 'Người thuê 101', role: 'tenant' },
      at: '2026-11-08T03:01:00+00:00',
    },
  ],
  acknowledgedByMe: true,
  timeline: [
    {
      at: '2026-11-08T03:00:00+00:00',
      kind: 'detected',
      measurement,
      actor: null,
      count: 1,
    },
    {
      at: '2026-11-08T03:01:00+00:00',
      kind: 'acknowledged',
      measurement: null,
      actor: { id: '1002', displayName: 'Người thuê 101' },
      count: 1,
    },
  ],
}

describe('sự cố từ backend', () => {
  it('đọc được chi tiết sự cố kể cả khi không có dấu hiệu', () => {
    const parsed = incidentDetailSchema.parse(detail)
    expect(parsed.signs).toEqual([])
    expect(signsText(parsed.signs)).toBe('Cảnh báo')
  })

  it('chỉ đóng được khi cảm biến đã khôi phục mà chưa ai đóng', () => {
    const base = incidentDetailSchema.parse(detail)
    expect(canResolve(base)).toBe(false)
    expect(canResolve({ ...base, recoveredAt: '2026-11-08T03:05:00+00:00' })).toBe(true)
    expect(
      canResolve({
        ...base,
        recoveredAt: '2026-11-08T03:05:00+00:00',
        closedAt: '2026-11-08T03:06:00+00:00',
      }),
    ).toBe(false)
  })
})
