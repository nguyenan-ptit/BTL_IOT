import { http, HttpResponse } from 'msw'
import type { Incident, IncidentTimelineEntry } from '@/features/incidents/schemas'
import { audit, db, roomIdsInScope, type MockIncident, type MockUser } from '../db'
import { apiError, paginate, requireUser } from './util'

function toIncident(incident: MockIncident, viewer: MockUser): Incident {
  return {
    id: incident.id,
    roomId: incident.roomId,
    roomName: db.rooms.find((r) => r.id === incident.roomId)?.name ?? incident.roomId,
    signs: incident.signs,
    status: incident.status,
    startedAt: incident.startedAt,
    resolvedAt: incident.resolvedAt,
    firstMeasurement: incident.firstMeasurement,
    latestMeasurement: incident.latestMeasurement,
    acknowledgements: incident.acknowledgements.map((a) => {
      const user = db.users.find((u) => u.id === a.userId)
      return {
        user: {
          id: a.userId,
          displayName: user?.displayName ?? 'Không rõ',
          role: user?.role ?? 'tenant',
        },
        at: a.at,
      }
    }),
    acknowledgedByMe: incident.acknowledgements.some((a) => a.userId === viewer.id),
  }
}

/** Gộp các lần "updated" liên tiếp thành một dòng có `count` (edge case sự cố kéo dài). */
function mergeTimeline(events: MockIncident['events']): IncidentTimelineEntry[] {
  const out: IncidentTimelineEntry[] = []
  for (const event of events) {
    const prev = out[out.length - 1]
    if (event.kind === 'updated' && prev?.kind === 'updated') {
      prev.count += 1
      prev.at = event.at
      prev.measurement = event.measurement
      continue
    }
    out.push({ ...event, count: 1 })
  }
  return out
}

function visibleIncidents(user: MockUser) {
  const scope = roomIdsInScope(user)
  return db.incidents.filter((i) => scope.has(i.roomId))
}

const statusRank = { open: 0, acknowledged: 1, resolved: 2 } as const

export const incidentHandlers = [
  http.get('/api/incidents', ({ request }) => {
    const user = requireUser()
    if (user instanceof Response) return user
    const url = new URL(request.url)
    const roomId = url.searchParams.get('roomId')
    const statuses = url.searchParams.getAll('status')
    const from = url.searchParams.get('from')
    const to = url.searchParams.get('to')
    const items = visibleIncidents(user)
      .filter((i) => !roomId || i.roomId === roomId)
      .filter((i) => statuses.length === 0 || statuses.includes(i.status))
      .filter((i) => !from || i.startedAt >= from)
      .filter((i) => !to || i.startedAt <= to)
      .sort(
        (a, b) =>
          statusRank[a.status] - statusRank[b.status] || b.startedAt.localeCompare(a.startedAt),
      )
      .map((i) => toIncident(i, user))
    return HttpResponse.json(paginate(items, url))
  }),

  http.get('/api/incidents/active', () => {
    const user = requireUser()
    if (user instanceof Response) return user
    return HttpResponse.json(
      visibleIncidents(user)
        .filter((i) => i.status !== 'resolved')
        .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
        .map((i) => toIncident(i, user)),
    )
  }),

  http.get('/api/incidents/:id', ({ params }) => {
    const user = requireUser()
    if (user instanceof Response) return user
    const incident = visibleIncidents(user).find((i) => i.id === params.id)
    if (!incident) return apiError(404, 'NOT_FOUND', 'Không tìm thấy sự cố.')
    return HttpResponse.json({
      ...toIncident(incident, user),
      timeline: mergeTimeline(incident.events),
    })
  }),

  http.post('/api/incidents/:id/acknowledge', ({ params }) => {
    const user = requireUser()
    if (user instanceof Response) return user
    const incident = visibleIncidents(user).find((i) => i.id === params.id)
    if (!incident) return apiError(404, 'NOT_FOUND', 'Không tìm thấy sự cố.')
    if (incident.status === 'resolved') {
      return apiError(409, 'INCIDENT_ALREADY_RESOLVED', 'Sự cố đã kết thúc.')
    }
    // Bấm lại khi đã tiếp nhận thì trả trạng thái hiện tại, không báo lỗi (contracts/api.md).
    if (!incident.acknowledgements.some((a) => a.userId === user.id)) {
      const at = new Date().toISOString()
      incident.acknowledgements.push({ userId: user.id, at })
      incident.status = 'acknowledged'
      incident.events.push({
        at,
        kind: 'acknowledged',
        measurement: null,
        actor: { id: user.id, displayName: user.displayName },
      })
      const roomName = db.rooms.find((r) => r.id === incident.roomId)?.name ?? ''
      audit(
        user,
        'incident_acknowledged',
        { type: 'incident', id: incident.id, label: `Sự cố phòng ${roomName}` },
        `${user.displayName} tiếp nhận sự cố phòng ${roomName}`,
      )
    }
    return HttpResponse.json(toIncident(incident, user))
  }),
]
