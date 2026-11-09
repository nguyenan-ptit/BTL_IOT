import type { DeviceLifecycle } from '@/features/devices/schemas'

export type Activity = 'online' | 'offline' | 'never' | 'blocked' | 'maintenance' | 'retired'

/**
 * Trạng thái hiển thị của node ở tổng quan admin. Node bị khoá, bảo trì hay ngừng sử dụng
 * thì ngừng gửi số đo do quyết định của người quản lý, không phải mất kết nối.
 */
export function activityOf(node: {
  lifecycle: DeviceLifecycle
  online: boolean
  lastSeenAt: string | null
}): Activity {
  if (node.lifecycle === 'blocked') return 'blocked'
  if (node.lifecycle === 'maintenance') return 'maintenance'
  if (node.lifecycle === 'decommissioned') return 'retired'
  if (node.online) return 'online'
  return node.lastSeenAt ? 'offline' : 'never'
}
