import { http, HttpResponse } from 'msw'
import { nodeActionSchema, type NodeHistoryEntry } from '@/features/nodes/schemas'
import { nextLifecycle } from '@/features/nodes/transitions'
import { nodeLifecycleLabel } from '@/shared/lib/labels'
import { actorOf, audit, connectivityOf, db, nextId, type MockNode, type MockUser } from '../db'
import { apiError, paginate, requireUser } from './util'

const CODE_RE = /^[A-Z0-9-]{3,32}$/

function toNode(node: MockNode) {
  return {
    id: node.id,
    code: node.code,
    roomId: node.roomId,
    lifecycle: node.lifecycle,
    connectivity: connectivityOf(node),
    lastSeenAt: node.lastSeenAt,
  }
}

function roomName(roomId: string | null) {
  return roomId ? (db.rooms.find((r) => r.id === roomId)?.name ?? null) : null
}

function history(
  node: MockNode,
  user: MockUser,
  entry: Omit<NodeHistoryEntry, 'id' | 'nodeId' | 'at' | 'actor'>,
) {
  db.nodeHistory.push({
    id: nextId('h'),
    nodeId: node.id,
    at: new Date().toISOString(),
    actor: actorOf(user),
    ...entry,
  })
}

/** Giữ Room.activeNodeId khớp với node đang dùng hoặc bảo trì của phòng. */
function syncRooms() {
  for (const room of db.rooms) {
    const node = db.nodes.find(
      (n) => n.roomId === room.id && (n.lifecycle === 'active' || n.lifecycle === 'maintenance'),
    )
    room.activeNodeId = node?.id ?? null
  }
}

function roomTaken(roomId: string, exceptNodeId: string) {
  return db.nodes.some(
    (n) =>
      n.id !== exceptNodeId &&
      n.roomId === roomId &&
      (n.lifecycle === 'active' || n.lifecycle === 'maintenance'),
  )
}

export const nodeHandlers = [
  http.get('/api/nodes', ({ request }) => {
    const user = requireUser('admin')
    if (user instanceof Response) return user
    const url = new URL(request.url)
    const lifecycle = url.searchParams.getAll('lifecycle')
    const items = db.nodes
      .filter((n) => lifecycle.length === 0 || lifecycle.includes(n.lifecycle))
      .sort((a, b) => a.code.localeCompare(b.code))
      .map((n) => ({ ...toNode(n), roomName: roomName(n.roomId) }))
    return HttpResponse.json(paginate(items, url))
  }),

  http.get('/api/nodes/:id', ({ params }) => {
    const user = requireUser('admin')
    if (user instanceof Response) return user
    const node = db.nodes.find((n) => n.id === params.id)
    if (!node) return apiError(404, 'NOT_FOUND', 'Không tìm thấy node.')
    return HttpResponse.json({ ...toNode(node), roomName: roomName(node.roomId) })
  }),

  http.post('/api/nodes', async ({ request }) => {
    const user = requireUser('admin')
    if (user instanceof Response) return user
    const body = (await request.json().catch(() => null)) as {
      code?: string
      roomId?: string | null
    } | null
    const code = body?.code?.trim().toUpperCase() ?? ''
    if (!CODE_RE.test(code)) {
      return apiError(422, 'VALIDATION_ERROR', 'Mã node không hợp lệ.', {
        code: 'Mã node gồm 3–32 ký tự A–Z, 0–9 hoặc dấu gạch ngang.',
      })
    }
    if (db.nodes.some((n) => n.code === code)) {
      return apiError(409, 'NODE_CODE_TAKEN', 'Mã node đã tồn tại.')
    }
    const node: MockNode = {
      id: nextId('n'),
      code,
      roomId: body?.roomId ?? null,
      lifecycle: 'registered',
      lastSeenAt: null,
      faultySensors: new Set(),
    }
    db.nodes.push(node)
    history(node, user, {
      kind: 'registered',
      fromLifecycle: null,
      toLifecycle: 'registered',
      fromRoomId: null,
      toRoomId: null,
    })
    if (node.roomId)
      history(node, user, {
        kind: 'assigned',
        fromLifecycle: null,
        toLifecycle: null,
        fromRoomId: null,
        toRoomId: node.roomId,
      })
    audit(
      user,
      'node_registered',
      { type: 'node', id: node.id, label: code },
      `Đăng ký node ${code}`,
    )
    return HttpResponse.json(toNode(node), { status: 201 })
  }),

  http.patch('/api/nodes/:id', async ({ params, request }) => {
    const user = requireUser('admin')
    if (user instanceof Response) return user
    const node = db.nodes.find((n) => n.id === params.id)
    if (!node) return apiError(404, 'NOT_FOUND', 'Không tìm thấy node.')
    if (node.lifecycle === 'retired') return apiError(409, 'NODE_RETIRED', 'Node đã ngừng sử dụng.')
    const body = (await request.json().catch(() => null)) as { roomId?: string | null } | null
    const roomId = body?.roomId ?? null
    if (roomId && !db.rooms.some((r) => r.id === roomId))
      return apiError(422, 'VALIDATION_ERROR', 'Phòng không tồn tại.')
    if (roomId && node.lifecycle !== 'registered' && roomTaken(roomId, node.id)) {
      return apiError(409, 'ROOM_HAS_ACTIVE_NODE', 'Phòng đã có node đang sử dụng.')
    }
    if (roomId !== node.roomId) {
      history(node, user, {
        kind: 'assigned',
        fromLifecycle: null,
        toLifecycle: null,
        fromRoomId: node.roomId,
        toRoomId: roomId,
      })
      audit(
        user,
        'node_assigned',
        { type: 'node', id: node.id, label: node.code },
        `Gán ${node.code} vào ${roomId ? `phòng ${roomName(roomId)}` : 'không phòng nào'}`,
      )
      node.roomId = roomId
      syncRooms()
    }
    return HttpResponse.json(toNode(node))
  }),

  http.post('/api/nodes/:id/transitions', async ({ params, request }) => {
    const user = requireUser('admin')
    if (user instanceof Response) return user
    const node = db.nodes.find((n) => n.id === params.id)
    if (!node) return apiError(404, 'NOT_FOUND', 'Không tìm thấy node.')
    const body = (await request.json().catch(() => null)) as { action?: string } | null
    const action = nodeActionSchema.safeParse(body?.action)
    const next = action.success ? nextLifecycle(node.lifecycle, action.data) : null
    if (!action.success || !next)
      return apiError(409, 'INVALID_TRANSITION', 'Không chuyển được sang trạng thái này.')
    if (action.data === 'activate') {
      if (!node.roomId) return apiError(409, 'NODE_NOT_ASSIGNED', 'Node chưa được gán phòng.')
      if (roomTaken(node.roomId, node.id))
        return apiError(409, 'ROOM_HAS_ACTIVE_NODE', 'Phòng đã có node đang sử dụng.')
    }
    const from = node.lifecycle
    node.lifecycle = next
    // Ngừng sử dụng thì thu hồi quyền kết nối: node không còn gửi được dữ liệu.
    if (next === 'retired') node.lastSeenAt = null
    if (next === 'active' && !node.lastSeenAt) node.lastSeenAt = new Date().toISOString()
    syncRooms()
    history(node, user, {
      kind: 'transitioned',
      fromLifecycle: from,
      toLifecycle: next,
      fromRoomId: null,
      toRoomId: null,
    })
    audit(
      user,
      'node_transitioned',
      { type: 'node', id: node.id, label: node.code },
      `${node.code}: ${nodeLifecycleLabel[from]} → ${nodeLifecycleLabel[next]}`,
    )
    return HttpResponse.json(toNode(node))
  }),

  http.get('/api/nodes/:id/history', ({ params }) => {
    const user = requireUser('admin')
    if (user instanceof Response) return user
    return HttpResponse.json(
      db.nodeHistory
        .filter((h) => h.nodeId === params.id)
        .sort(
          (a, b) => b.at.localeCompare(a.at) || b.id.localeCompare(a.id, 'en', { numeric: true }),
        ),
    )
  }),
]
