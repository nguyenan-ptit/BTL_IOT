import type {
  AuditAction,
  Connectivity,
  HazardSign,
  IncidentStatus,
  NodeLifecycle,
  Role,
  RoomOverall,
  SensorHealth,
  SensorKind,
} from '@/shared/schemas/common'

export const roleLabel: Record<Role, string> = {
  admin: 'Quản trị viên',
  landlord: 'Chủ trọ',
  tenant: 'Người thuê',
}

export const nodeLifecycleLabel: Record<NodeLifecycle, string> = {
  registered: 'Đã đăng ký',
  active: 'Đang sử dụng',
  maintenance: 'Bảo trì',
  retired: 'Ngừng sử dụng',
}

export const connectivityLabel: Record<Connectivity, string> = {
  online: 'Trực tuyến',
  offline: 'Mất kết nối',
}

export const sensorKindLabel: Record<SensorKind, string> = {
  gas: 'Khí gas/khói',
  temperature: 'Nhiệt độ',
  flame: 'Lửa',
}

export const sensorHealthLabel: Record<SensorHealth, string> = {
  ok: 'Hoạt động',
  fault: 'Lỗi',
}

export const hazardSignLabel: Record<HazardSign, string> = {
  gas: 'Khí gas/khói',
  high_temperature: 'Nhiệt độ cao',
  flame: 'Lửa',
}

export const incidentStatusLabel: Record<IncidentStatus, string> = {
  open: 'Chưa tiếp nhận',
  acknowledged: 'Đã tiếp nhận',
  resolved: 'Đã kết thúc',
}

export const roomOverallLabel: Record<RoomOverall, string> = {
  no_device: 'Chưa có thiết bị',
  alarm: 'Cảnh báo',
  maintenance: 'Đang bảo trì',
  offline: 'Mất kết nối',
  sensor_fault: 'Lỗi cảm biến',
  normal: 'Bình thường',
}

export const auditActionLabel: Record<AuditAction, string> = {
  user_created: 'Tạo tài khoản',
  user_updated: 'Sửa tài khoản',
  user_locked: 'Khóa tài khoản',
  user_unlocked: 'Mở khóa tài khoản',
  node_registered: 'Đăng ký node',
  node_assigned: 'Gán phòng cho node',
  node_transitioned: 'Chuyển trạng thái node',
  incident_acknowledged: 'Tiếp nhận sự cố',
  threshold_updated: 'Đổi ngưỡng cảnh báo',
}
