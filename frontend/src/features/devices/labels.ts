import type { CommandStatus } from './schemas'

/** Nhãn trạng thái lệnh điều khiển; ý nghĩa theo bảng "Trạng thái lệnh" trong docs/LONG_API.md. */
export const commandStatusLabel: Record<CommandStatus, string> = {
  queued: 'Đã ghi, chưa gửi',
  pending: 'Chờ ESP xác nhận',
  unconfirmed: 'Chưa rõ đã gửi được chưa',
  running: 'ESP đang thực hiện',
  applied: 'ESP đã áp dụng',
  completed: 'ESP đã hoàn tất',
  stopped: 'Đã dừng',
  blocked: 'Bị chặn do cảnh báo thật',
  interrupted: 'Bị ngắt',
  superseded: 'Đã bị thay thế',
  timeout: 'Hết hạn, chưa có xác nhận',
  failed: 'Bị từ chối',
}
