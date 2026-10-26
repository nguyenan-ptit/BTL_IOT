import type { NodeLifecycle } from '@/shared/schemas/common'
import type { NodeAction } from './schemas'

/**
 * Chuyển trạng thái hợp lệ của node (FR-025, data-model.md):
 * Đã đăng ký → Đang sử dụng; Đang sử dụng ↔ Bảo trì; mọi trạng thái trừ Ngừng sử dụng → Ngừng sử dụng.
 */
const TRANSITIONS: Record<NodeLifecycle, Partial<Record<NodeAction, NodeLifecycle>>> = {
  registered: { activate: 'active', retire: 'retired' },
  active: { maintain: 'maintenance', retire: 'retired' },
  maintenance: { activate: 'active', retire: 'retired' },
  retired: {},
}

export function allowedActions(lifecycle: NodeLifecycle): NodeAction[] {
  return Object.keys(TRANSITIONS[lifecycle]) as NodeAction[]
}

export function nextLifecycle(lifecycle: NodeLifecycle, action: NodeAction): NodeLifecycle | null {
  return TRANSITIONS[lifecycle][action] ?? null
}

export const nodeActionLabel: Record<NodeAction, string> = {
  activate: 'Kích hoạt',
  maintain: 'Chuyển bảo trì',
  retire: 'Ngừng sử dụng',
}
