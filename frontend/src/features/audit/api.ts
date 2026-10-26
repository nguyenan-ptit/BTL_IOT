import { useQuery, keepPreviousData } from '@tanstack/react-query'
import { request } from '@/shared/api/http'
import { pageSchema, type AuditAction } from '@/shared/schemas/common'
import { auditLogEntrySchema } from './schemas'

export type AuditFilters = {
  actions: AuditAction[]
  from: string | null
  to: string | null
  page: number
}

export const AUDIT_PAGE_SIZE = 30

export function fetchAuditLogs(f: AuditFilters, signal?: AbortSignal) {
  return request('/api/audit-logs', pageSchema(auditLogEntrySchema), {
    query: { action: f.actions, from: f.from, to: f.to, page: f.page, pageSize: AUDIT_PAGE_SIZE },
    signal,
  })
}

export function useAuditLogs(f: AuditFilters) {
  return useQuery({
    queryKey: ['audit', f],
    queryFn: ({ signal }) => fetchAuditLogs(f, signal),
    placeholderData: keepPreviousData,
    refetchInterval: 15_000,
  })
}
