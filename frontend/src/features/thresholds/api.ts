import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toThresholdPayload } from '@/features/devices/adapters'
import { deviceKeys } from '@/features/devices/api'
import {
  buzzerCommandSchema,
  thresholdCommandSchema,
  type Telemetry,
} from '@/features/devices/schemas'
import { CONTROL_HEADERS, request } from '@/shared/api/http'
import type { ThresholdValues } from './schemas'

function devicePath(id: string, action: string) {
  return `/api/devices/${encodeURIComponent(id)}/${action}`
}

/** Gửi ngưỡng mới cho node. Giá trị expected lấy từ telemetry mới nhất, backend dùng để chống lệnh cũ. */
export function useSendThresholds() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (v: { deviceId: string; data: Telemetry; values: ThresholdValues }) =>
      request(devicePath(v.deviceId, 'thresholds'), thresholdCommandSchema, {
        method: 'POST',
        headers: CONTROL_HEADERS,
        body: {
          expected_boot_id: v.data.boot_id,
          expected_revision: v.data.remote_config?.revision ?? 0,
          thresholds: toThresholdPayload(v.values),
        },
      }),
    onSettled: () => void queryClient.invalidateQueries({ queryKey: deviceKeys.all }),
  })
}

/** Bắt đầu/dừng lượt thử còi và đèn khoảng 3 giây. Dừng không tắt cảnh báo thật. */
export function useBuzzerTest() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (v: { deviceId: string; data: Telemetry; action: 'start' | 'stop' }) =>
      request(devicePath(v.deviceId, 'buzzer-test'), buzzerCommandSchema, {
        method: 'POST',
        headers: CONTROL_HEADERS,
        body: {
          expected_boot_id: v.data.boot_id,
          expected_seq: v.data.buzzer_test?.command_seq ?? 0,
          action: v.action,
        },
      }),
    onSettled: () => void queryClient.invalidateQueries({ queryKey: deviceKeys.all }),
  })
}
