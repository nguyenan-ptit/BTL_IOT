import { z } from 'zod'
import { request } from '@/shared/api/http'
import { pageSchema, type NodeLifecycle } from '@/shared/schemas/common'
import { nodeHistoryEntrySchema, nodeListItemSchema, nodeSchema, type NodeAction } from './schemas'

export const nodeKeys = {
  all: ['nodes'] as const,
  list: (lifecycle: NodeLifecycle[], page: number) => ['nodes', 'list', lifecycle, page] as const,
  detail: (id: string) => ['nodes', 'detail', id] as const,
  history: (id: string) => ['nodes', 'history', id] as const,
}

export const NODE_PAGE_SIZE = 20

export function fetchNodes(lifecycle: NodeLifecycle[], page: number, signal?: AbortSignal) {
  return request('/api/nodes', pageSchema(nodeListItemSchema), {
    query: { lifecycle, page, pageSize: NODE_PAGE_SIZE },
    signal,
  })
}

export function fetchNode(id: string, signal?: AbortSignal) {
  return request(`/api/nodes/${encodeURIComponent(id)}`, nodeListItemSchema, { signal })
}

export function fetchNodeHistory(id: string, signal?: AbortSignal) {
  return request(`/api/nodes/${encodeURIComponent(id)}/history`, z.array(nodeHistoryEntrySchema), {
    signal,
  })
}

export function registerNode(body: { code: string; roomId: string | null }) {
  return request('/api/nodes', nodeSchema, { method: 'POST', body })
}

export function assignNode(id: string, roomId: string | null) {
  return request(`/api/nodes/${encodeURIComponent(id)}`, nodeSchema, {
    method: 'PATCH',
    body: { roomId },
  })
}

export function transitionNode(id: string, action: NodeAction) {
  return request(`/api/nodes/${encodeURIComponent(id)}/transitions`, nodeSchema, {
    method: 'POST',
    body: { action },
  })
}
