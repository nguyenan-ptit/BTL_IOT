import { request } from '@/shared/api/http'
import { deviceListSchema } from './schemas'

export const deviceKeys = {
  all: ['devices'] as const,
  list: ['devices', 'list'] as const,
  detail: (id: string) => ['devices', 'detail', id] as const,
  commands: (id: string) => ['devices', 'commands', id] as const,
  operation: (id: string, operationId: string) =>
    ['devices', 'operation', id, operationId] as const,
}

/** Mọi node trong phạm vi người dùng, kèm telemetry mới nhất và trạng thái lệnh đang chờ. */
export async function fetchDevices(signal?: AbortSignal) {
  const result = await request('/api/devices', deviceListSchema, { signal })
  return result.items
}
