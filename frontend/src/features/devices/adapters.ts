import type { Measurement } from '@/features/history/schemas'
import type { ThresholdValues } from '@/features/thresholds/schemas'
import type {
  CommandStatus,
  DeviceItem,
  HistorySample,
  Telemetry,
  ThresholdPayload,
} from './schemas'

/**
 * Một mẫu /api/history → số đo của website.
 * Giờ đo lấy từ `measured_at` (SNTP trên ESP); backend cũ không có thì dùng giờ nhận.
 * Cảm biến có health khác "ok" thì giá trị là null, không hiện số cũ.
 */
export function toMeasurement(sample: HistorySample): Measurement {
  const { temperature, mq2, flame } = sample.data
  return {
    measuredAt: sample.measured_at ?? sample.received_at,
    receivedAt: sample.received_at,
    isBackfill: sample.is_backfill ?? sample.data.backfill === true,
    gas: mq2.health === 'ok' ? mq2.adc_raw : null,
    temperature: temperature.health === 'ok' ? temperature.value_c : null,
    flame: flame.health === 'ok' ? flame.alarm : null,
  }
}

/** Ngưỡng node đang dùng, đọc từ telemetry (backend không lưu ngưỡng riêng). */
export function currentThresholds(data: Telemetry): ThresholdValues {
  return {
    gasOn: data.mq2.adc_on,
    gasOff: data.mq2.adc_off,
    tempOn: data.limits.temperature_on_c,
    tempOff: data.limits.temperature_off_c,
  }
}

const WAITING: ReadonlySet<CommandStatus> = new Set(['queued', 'pending', 'unconfirmed', 'running'])

/** Lệnh còn chờ ESP xác nhận (chưa có kết quả cuối). */
export function isWaiting(status: CommandStatus | undefined): boolean {
  return status !== undefined && WAITING.has(status)
}

/**
 * Lý do chưa gửi được lệnh cho node, `null` khi gửi được.
 * Backend kiểm tra lại tất cả; đây chỉ để khoá nút và giải thích trước.
 */
export function controlBlockReason(item: DeviceItem, kind: 'thresholds' | 'buzzer'): string | null {
  const control = kind === 'thresholds' ? item.remote_control : item.buzzer_control
  if (item.data === null) return 'Chưa có dữ liệu từ node.'
  if (!item.online) return 'Node đang mất kết nối.'
  if (!item.can_control) return 'Node chưa ở trạng thái cho phép điều khiển.'
  if (!control.supported) return 'Firmware chưa hỗ trợ điều khiển từ xa.'
  if (isWaiting(control.pending?.status)) return 'Đang chờ ESP xác nhận lệnh trước.'
  return null
}

export function toThresholdPayload(values: ThresholdValues): ThresholdPayload {
  return {
    mq2_on: values.gasOn,
    mq2_off: values.gasOff,
    temperature_on_c: values.tempOn,
    temperature_off_c: values.tempOff,
  }
}
