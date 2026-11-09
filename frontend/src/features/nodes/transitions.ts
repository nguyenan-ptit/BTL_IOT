import type { CredentialStatus, DeviceLifecycle, MqttSyncStatus } from '@/features/devices/schemas'

/** Chép đúng LIFECYCLE_TRANSITIONS trong backend/app/api/routes/devices.py. */
const TRANSITIONS: Record<DeviceLifecycle, DeviceLifecycle[]> = {
  registered: ['provisioned', 'blocked', 'decommissioned'],
  provisioned: ['active', 'blocked', 'decommissioned'],
  active: ['maintenance', 'blocked', 'decommissioned'],
  maintenance: ['active', 'blocked', 'decommissioned'],
  blocked: ['active', 'decommissioned'],
  decommissioned: [],
}

/**
 * Trạng thái có thể chuyển tới bằng PATCH /lifecycle.
 * `provisioned` chỉ đạt được qua cấp tài khoản MQTT, nên không đưa thành nút chuyển.
 */
export function allowedTargets(lifecycle: DeviceLifecycle): DeviceLifecycle[] {
  return TRANSITIONS[lifecycle].filter((target) => target !== 'provisioned')
}

export const deviceLifecycleLabel: Record<DeviceLifecycle, string> = {
  registered: 'Đã đăng ký',
  provisioned: 'Chờ kích hoạt',
  active: 'Đang sử dụng',
  maintenance: 'Bảo trì',
  blocked: 'Đã khoá',
  decommissioned: 'Ngừng sử dụng',
}

/** Nhãn nút chuyển sang trạng thái đích. */
export const transitionLabel: Record<DeviceLifecycle, string> = {
  registered: '',
  provisioned: '',
  active: 'Kích hoạt',
  maintenance: 'Chuyển bảo trì',
  blocked: 'Khoá node',
  decommissioned: 'Ngừng sử dụng',
}

export const credentialLabel: Record<CredentialStatus, string> = {
  pending: 'Chờ cấp hoặc xác nhận',
  active: 'Đã cấp hoặc xác nhận',
  revoked: 'Đã đánh dấu thu hồi',
}

export const mqttSyncLabel: Record<MqttSyncStatus, string> = {
  unknown: 'Chưa rõ (cấu hình ngoài hệ thống)',
  pending: 'Đang đồng bộ',
  synced: 'Đã đồng bộ',
  failed: 'Đồng bộ chưa hoàn tất',
  manual_verified: 'Đã xác nhận MQTT thủ công',
}
