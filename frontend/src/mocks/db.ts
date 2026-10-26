import type { Permission, User } from '@/features/auth/schemas'
import type { AuditLogEntry } from '@/features/audit/schemas'
import type { Measurement } from '@/features/history/schemas'
import type { IncidentTimelineEntry } from '@/features/incidents/schemas'
import type { NodeHistoryEntry } from '@/features/nodes/schemas'
import type { BoardingHouse, Room } from '@/features/rooms/schemas'
import type {
  HazardSign,
  IncidentStatus,
  NodeLifecycle,
  Role,
  SensorKind,
} from '@/shared/schemas/common'

// Dữ liệu giả lập trong bộ nhớ, theo data-model.md. Chỉ chạy khi VITE_USE_MOCK=true.

export type MockUser = User & { password: string }

export type MockNode = {
  id: string
  code: string
  roomId: string | null
  lifecycle: NodeLifecycle
  lastSeenAt: string | null
  /** Cảm biến đang hỏng (bộ mô phỏng đặt). */
  faultySensors: Set<SensorKind>
}

export type MockIncident = {
  id: string
  roomId: string
  signs: HazardSign[]
  status: IncidentStatus
  startedAt: string
  resolvedAt: string | null
  firstMeasurement: Measurement
  latestMeasurement: Measurement
  acknowledgements: { userId: string; at: string }[]
  /** Dòng thời gian gốc, chưa gộp; handler gộp các lần `updated` liên tiếp khi trả về. */
  events: Omit<IncidentTimelineEntry, 'count'>[]
}

export const db = {
  users: [] as MockUser[],
  boardingHouses: [] as BoardingHouse[],
  rooms: [] as Room[],
  nodes: [] as MockNode[],
  nodeHistory: [] as NodeHistoryEntry[],
  /** Số đo theo phòng, cũ trước mới sau. */
  measurements: new Map<string, Measurement[]>(),
  incidents: [] as MockIncident[],
  auditLog: [] as AuditLogEntry[],
}

// Phiên đăng nhập giả, thay cho cookie phiên của backend. Lưu ở sessionStorage để tải lại trang
// không bị đăng xuất, giống cookie thật.
const SESSION_KEY = 'mock-session-user'

export const session = {
  get(): string | null {
    try {
      return sessionStorage.getItem(SESSION_KEY)
    } catch {
      return null
    }
  },
  set(userId: string | null) {
    try {
      if (userId) sessionStorage.setItem(SESSION_KEY, userId)
      else sessionStorage.removeItem(SESSION_KEY)
    } catch {
      // Trình duyệt chặn storage: phiên chỉ sống tới lần tải lại trang.
    }
  },
}

let sequence = 1000
export function nextId(prefix: string): string {
  sequence += 1
  return `${prefix}${sequence}`
}

export const OFFLINE_AFTER_MS = 10_000

export function permissionsFor(role: Role): Permission[] {
  if (role === 'admin')
    return ['nodes:manage', 'users:manage', 'audit:read', 'incidents:acknowledge']
  return ['incidents:acknowledge']
}

export function currentUser(): MockUser | null {
  return db.users.find((u) => u.id === session.get() && !u.locked) ?? null
}

/** Các phòng người dùng được xem (FR-003). */
export function roomIdsInScope(user: MockUser): Set<string> {
  if (user.role === 'admin') return new Set(db.rooms.map((r) => r.id))
  if (user.role === 'landlord') {
    return new Set(
      db.rooms
        .filter((r) => user.scope.boardingHouseIds.includes(r.boardingHouseId))
        .map((r) => r.id),
    )
  }
  return new Set(user.scope.roomIds)
}

export function toPublicUser(user: MockUser): User {
  const { password: _password, ...rest } = user
  return rest
}

export function actorOf(user: MockUser) {
  return { id: user.id, displayName: user.displayName }
}

export function nodeOfRoom(roomId: string): MockNode | undefined {
  return db.nodes.find(
    (n) => n.roomId === roomId && (n.lifecycle === 'active' || n.lifecycle === 'maintenance'),
  )
}

export function connectivityOf(node: MockNode, now = Date.now()): 'online' | 'offline' {
  if (!node.lastSeenAt) return 'offline'
  return now - new Date(node.lastSeenAt).getTime() > OFFLINE_AFTER_MS ? 'offline' : 'online'
}

export function audit(
  actor: MockUser,
  action: AuditLogEntry['action'],
  target: AuditLogEntry['target'],
  summary: string,
) {
  db.auditLog.unshift({
    id: nextId('a'),
    at: new Date().toISOString(),
    actor: actorOf(actor),
    action,
    target,
    summary,
  })
}
