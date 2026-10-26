import { z } from 'zod'
import { request } from '@/shared/api/http'
import { pageSchema, type IncidentStatus } from '@/shared/schemas/common'
import { incidentDetailSchema, incidentSchema } from './schemas'

export type IncidentFilters = {
  roomId?: string | null
  status?: IncidentStatus[]
  from?: string | null
  to?: string | null
  page: number
}

export const incidentKeys = {
  all: ['incidents'] as const,
  list: (filters: IncidentFilters) => ['incidents', 'list', filters] as const,
  active: ['incidents', 'active'] as const,
  detail: (id: string) => ['incidents', 'detail', id] as const,
}

export const INCIDENT_PAGE_SIZE = 20

export function fetchIncidents(filters: IncidentFilters, signal?: AbortSignal) {
  return request('/api/incidents', pageSchema(incidentSchema), {
    query: {
      roomId: filters.roomId,
      status: filters.status,
      from: filters.from,
      to: filters.to,
      page: filters.page,
      pageSize: INCIDENT_PAGE_SIZE,
    },
    signal,
  })
}

export function fetchActiveIncidents(signal?: AbortSignal) {
  return request('/api/incidents/active', z.array(incidentSchema), { signal })
}

export function fetchIncident(id: string, signal?: AbortSignal) {
  return request(`/api/incidents/${encodeURIComponent(id)}`, incidentDetailSchema, { signal })
}

export function acknowledgeIncident(id: string) {
  return request(`/api/incidents/${encodeURIComponent(id)}/acknowledge`, incidentSchema, {
    method: 'POST',
  })
}
