import { http, HttpResponse } from 'msw'
import { sameValues, thresholdFormSchema, type RoomThreshold } from '@/features/thresholds/schemas'
import { formatInteger, formatTemperature } from '@/shared/lib/number'
import {
  actorOf,
  audit,
  connectivityOf,
  db,
  DEFAULT_THRESHOLDS,
  nodeOfRoom,
  roomIdsInScope,
  thresholdOf,
  type MockUser,
} from '../db'
import type { ThresholdValues } from '@/features/thresholds/schemas'
import { apiError, requireUser } from './util'

/** Chờ node áp dụng quá chừng này thì coi là "Node không phản hồi" (FR-041). */
const UNREACHABLE_AFTER_MS = 60_000

function requireManager(): MockUser | Response {
  const user = requireUser()
  if (user instanceof Response) return user
  if (user.role === 'tenant') {
    return apiError(403, 'FORBIDDEN', 'Bạn không có quyền đổi ngưỡng cảnh báo.')
  }
  return user
}

function toRoomThreshold(roomId: string): RoomThreshold {
  const t = thresholdOf(roomId)
  const node = nodeOfRoom(roomId)
  let sync: RoomThreshold['sync'] = 'applied'
  if (!sameValues(t.desired, t.reported)) {
    const waited = t.updatedAt ? Date.now() - Date.parse(t.updatedAt) : 0
    const offline = !node || connectivityOf(node) === 'offline'
    sync = offline || waited > UNREACHABLE_AFTER_MS ? 'unreachable' : 'pending'
  }
  return {
    roomId,
    roomName: db.rooms.find((r) => r.id === roomId)?.name ?? roomId,
    desired: t.desired,
    // Phòng chưa có node thì không có ngưỡng nào được báo về.
    reported: node ? t.reported : null,
    sync: node ? sync : 'unreachable',
    updatedAt: t.updatedAt,
    updatedBy: t.updatedBy,
  }
}

function describe(v: ThresholdValues): string {
  return `gas ${formatInteger(v.gasOn)}/${formatInteger(v.gasOff)}, nhiệt độ ${formatTemperature(v.tempOn)}/${formatTemperature(v.tempOff)}`
}

function apply(user: MockUser, roomIds: string[], values: ThresholdValues) {
  const scope = roomIdsInScope(user)
  const targets = roomIds.filter((id) => scope.has(id))
  const at = new Date().toISOString()
  for (const roomId of targets) {
    const t = thresholdOf(roomId)
    if (sameValues(t.desired, values)) continue
    const before = t.desired
    t.desired = { ...values }
    t.updatedAt = at
    t.updatedBy = actorOf(user)
    const roomName = db.rooms.find((r) => r.id === roomId)?.name ?? roomId
    audit(
      user,
      'threshold_updated',
      { type: 'room', id: roomId, label: `Phòng ${roomName}` },
      `Phòng ${roomName}: ${describe(before)} → ${describe(values)} (bật/tắt)`,
    )
  }
  return targets
}

export const thresholdHandlers = [
  http.get('/api/thresholds', () => {
    const user = requireManager()
    if (user instanceof Response) return user
    const scope = roomIdsInScope(user)
    return HttpResponse.json(
      db.rooms.filter((r) => scope.has(r.id)).map((r) => toRoomThreshold(r.id)),
    )
  }),

  http.get('/api/thresholds/defaults', () => {
    const user = requireManager()
    if (user instanceof Response) return user
    return HttpResponse.json(DEFAULT_THRESHOLDS)
  }),

  http.put('/api/thresholds', async ({ request }) => {
    const user = requireManager()
    if (user instanceof Response) return user
    const body = (await request.json().catch(() => null)) as {
      roomIds?: string[]
      values?: unknown
    } | null
    const parsed = thresholdFormSchema.safeParse(body?.values)
    if (!parsed.success || !body?.roomIds?.length) {
      const fields: Record<string, string> = {}
      for (const issue of parsed.error?.issues ?? []) fields[issue.path.join('.')] = issue.message
      return apiError(422, 'VALIDATION_ERROR', 'Ngưỡng không hợp lệ.', fields)
    }
    const targets = apply(user, body.roomIds, parsed.data)
    return HttpResponse.json(targets.map(toRoomThreshold))
  }),

  http.post('/api/thresholds/reset', async ({ request }) => {
    const user = requireManager()
    if (user instanceof Response) return user
    const body = (await request.json().catch(() => null)) as { roomIds?: string[] } | null
    const targets = apply(user, body?.roomIds ?? [], DEFAULT_THRESHOLDS)
    return HttpResponse.json(targets.map(toRoomThreshold))
  }),
]
