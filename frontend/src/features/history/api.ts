import { z } from 'zod'
import { currentThresholds, toMeasurement } from '@/features/devices/adapters'
import { historySampleSchema, type HistorySample } from '@/features/devices/schemas'
import type { ThresholdValues } from '@/features/thresholds/schemas'
import { request } from '@/shared/api/http'
import type { Measurement } from './schemas'

/** Backend trả tối đa 100 mẫu mới nhất; node gửi khoảng 2 giây/lần nên 100 mẫu ≈ 3 phút. */
export const HISTORY_LIMIT = 100

/** `null` là "mới nhất"; còn lại là khoảng tự chọn dạng ISO. */
export type HistoryRange = { from: string; to: string } | null

export type History = {
  /** Cũ → mới, để vẽ biểu đồ. */
  measurements: Measurement[]
  /** Ngưỡng node đang dùng, lấy từ mẫu mới nhất. */
  thresholds: ThresholdValues | null
  /** Đủ 100 mẫu: có thể còn dữ liệu cũ hơn trong khoảng không hiển thị. */
  truncated: boolean
}

export const historyKeys = {
  all: ['history'] as const,
  device: (deviceId: string, range: HistoryRange) => ['history', deviceId, range] as const,
}

/** Mẫu từ backend (mới nhất trước) → dữ liệu trang lịch sử. */
export function buildHistory(samples: HistorySample[]): History {
  const latest = samples[0]
  return {
    measurements: samples.map(toMeasurement).reverse(),
    thresholds: latest ? currentThresholds(latest.data) : null,
    truncated: samples.length >= HISTORY_LIMIT,
  }
}

export async function fetchHistory(deviceId: string, range: HistoryRange, signal?: AbortSignal) {
  const result = await request('/api/history', z.object({ items: z.array(historySampleSchema) }), {
    query: { device_id: deviceId, limit: HISTORY_LIMIT, from: range?.from, to: range?.to },
    signal,
  })
  return buildHistory(result.items)
}
