import type { Measurement } from '@/features/history/schemas'
import { db, type MockIncident } from './db'

// Dữ liệu mẫu cho chế độ giả lập. Tên nhà trọ, người dùng và số đo đều là dữ liệu bịa để demo.
// Tài khoản mẫu (chỉ tồn tại trong dữ liệu giả lập):
//   admin / matkhau123      Quản trị viên
//   chutro / matkhau123     Chủ trọ, quản lý nhà trọ bh1 (phòng 101, 102, 103)
//   thue101 / matkhau123    Người thuê phòng 101
//   thue102 / matkhau123    Người thuê phòng 102
export const DEMO_PASSWORD = 'matkhau123'

const MINUTE = 60_000
const DAY = 24 * 60 * MINUTE

/** Sinh số giả ngẫu nhiên lặp lại được, để lịch sử giống nhau mỗi lần tải trang. */
function seededRandom(seed: number) {
  let s = seed
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296
    return s / 4294967296
  }
}

export function baselineMeasurement(at: Date, rand: () => number, roomOffset = 0): Measurement {
  const hour = (at.getUTCHours() + 7) % 24
  // Ban ngày nóng hơn, tối nấu ăn thì gas nhích lên một chút.
  const dayCurve = Math.sin(((hour - 8) / 24) * 2 * Math.PI)
  const cooking = hour >= 18 && hour <= 19 ? 40 : 0
  return {
    measuredAt: at.toISOString(),
    receivedAt: at.toISOString(),
    isBackfill: false,
    gas: Math.round(180 + roomOffset * 15 + cooking + rand() * 30),
    temperature: Math.round((29 + roomOffset * 0.6 + dayCurve * 2.5 + rand() * 0.6) * 10) / 10,
    flame: false,
  }
}

export function seed(now = new Date()) {
  const t = now.getTime()
  const iso = (ms: number) => new Date(ms).toISOString()

  db.boardingHouses = [{ id: 'bh1', name: 'Nhà trọ ngõ 68 Cầu Giấy', landlordId: 'u-landlord' }]
  db.rooms = [
    { id: 'r101', boardingHouseId: 'bh1', name: '101', activeNodeId: 'n101' },
    { id: 'r102', boardingHouseId: 'bh1', name: '102', activeNodeId: 'n102' },
    { id: 'r103', boardingHouseId: 'bh1', name: '103', activeNodeId: null },
  ]

  const createdAt = iso(t - 30 * DAY)
  db.users = [
    {
      id: 'u-admin',
      username: 'admin',
      displayName: 'Quản trị hệ thống',
      role: 'admin',
      scope: { boardingHouseIds: [], roomIds: [] },
      locked: false,
      createdAt,
      password: DEMO_PASSWORD,
    },
    {
      id: 'u-landlord',
      username: 'chutro',
      displayName: 'Trần Thị Hoa',
      role: 'landlord',
      scope: { boardingHouseIds: ['bh1'], roomIds: [] },
      locked: false,
      createdAt,
      password: DEMO_PASSWORD,
    },
    {
      id: 'u-t101',
      username: 'thue101',
      displayName: 'Lê Minh Khoa',
      role: 'tenant',
      scope: { boardingHouseIds: [], roomIds: ['r101'] },
      locked: false,
      createdAt,
      password: DEMO_PASSWORD,
    },
    {
      id: 'u-t102',
      username: 'thue102',
      displayName: 'Phạm Thu Trang',
      role: 'tenant',
      scope: { boardingHouseIds: [], roomIds: ['r102'] },
      locked: false,
      createdAt,
      password: DEMO_PASSWORD,
    },
  ]

  db.nodes = [
    {
      id: 'n101',
      code: 'NODE-101',
      roomId: 'r101',
      lifecycle: 'active',
      lastSeenAt: iso(t),
      faultySensors: new Set(),
    },
    {
      id: 'n102',
      code: 'NODE-102',
      roomId: 'r102',
      lifecycle: 'active',
      lastSeenAt: iso(t),
      faultySensors: new Set(),
    },
  ]

  const admin = { id: 'u-admin', displayName: 'Quản trị hệ thống' }
  db.nodeHistory = ['n101', 'n102'].flatMap((nodeId, i) => {
    const roomId = i === 0 ? 'r101' : 'r102'
    const base = t - 20 * DAY
    return [
      {
        id: `h-${nodeId}-1`,
        nodeId,
        at: iso(base),
        actor: admin,
        kind: 'registered' as const,
        fromLifecycle: null,
        toLifecycle: 'registered' as const,
        fromRoomId: null,
        toRoomId: null,
      },
      {
        id: `h-${nodeId}-2`,
        nodeId,
        at: iso(base + MINUTE),
        actor: admin,
        kind: 'assigned' as const,
        fromLifecycle: null,
        toLifecycle: null,
        fromRoomId: null,
        toRoomId: roomId,
      },
      {
        id: `h-${nodeId}-3`,
        nodeId,
        at: iso(base + 2 * MINUTE),
        actor: admin,
        kind: 'transitioned' as const,
        fromLifecycle: 'registered' as const,
        toLifecycle: 'active' as const,
        fromRoomId: null,
        toRoomId: null,
      },
    ]
  })

  // Lịch sử 7 ngày, mỗi phút một số đo. Phòng 102 mất kết nối 40 phút vào hôm qua.
  const gapStart = t - DAY - 3 * 60 * MINUTE
  const gapEnd = gapStart + 40 * MINUTE
  db.rooms.slice(0, 2).forEach((room, roomIndex) => {
    const rand = seededRandom(roomIndex + 7)
    const list: Measurement[] = []
    for (let ms = t - 7 * DAY; ms < t; ms += MINUTE) {
      if (room.id === 'r102' && ms >= gapStart && ms < gapEnd) continue
      list.push(baselineMeasurement(new Date(ms), rand, roomIndex))
    }
    db.measurements.set(room.id, list)
  })

  // Một sự cố gas đã kết thúc ở phòng 101, hai ngày trước, đã được chủ trọ tiếp nhận.
  const start = t - 2 * DAY - 5 * 60 * MINUTE
  const list101 = db.measurements.get('r101') ?? []
  const spike: Measurement[] = []
  for (const m of list101) {
    const ms = new Date(m.measuredAt).getTime()
    if (ms >= start && ms < start + 12 * MINUTE) {
      const k = (ms - start) / MINUTE
      m.gas = Math.round(420 + Math.sin((k / 12) * Math.PI) * 260)
      spike.push(m)
    }
  }
  const first = spike[0]
  const last = spike[spike.length - 1]
  if (first && last) {
    const resolvedAt = iso(start + 15 * MINUTE)
    const ackAt = iso(start + 2 * MINUTE)
    const events: MockIncident['events'] = [
      { at: first.measuredAt, kind: 'detected', measurement: first, actor: null },
      ...spike
        .slice(1)
        .map((m) => ({ at: m.measuredAt, kind: 'updated' as const, measurement: m, actor: null })),
      {
        at: ackAt,
        kind: 'acknowledged',
        measurement: null,
        actor: { id: 'u-landlord', displayName: 'Trần Thị Hoa' },
      },
      { at: resolvedAt, kind: 'resolved', measurement: null, actor: null },
    ]
    const incident: MockIncident = {
      id: 'i-seed-1',
      roomId: 'r101',
      signs: ['gas'],
      status: 'resolved',
      startedAt: first.measuredAt,
      resolvedAt,
      firstMeasurement: first,
      latestMeasurement: last,
      acknowledgements: [{ userId: 'u-landlord', at: ackAt }],
      events: events.sort((a, b) => a.at.localeCompare(b.at)),
    }
    db.incidents = [incident]
  }

  db.auditLog = []
  db.thresholds = new Map()
}
