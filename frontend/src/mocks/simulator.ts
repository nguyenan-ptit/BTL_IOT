import type { Measurement } from '@/features/history/schemas'
import type { HazardSign, SensorKind } from '@/shared/schemas/common'
import { connectivityOf, db, nextId, nodeOfRoom, thresholdOf } from './db'
import { baselineMeasurement } from './seed'

// Bộ mô phỏng node: sinh số đo mỗi 2 giây và mở/cập nhật/đóng sự cố như backend sẽ làm.
// Ngưỡng lấy theo phòng (US7), có trễ: bật khi ≥ ngưỡng bật, chỉ tắt khi ≤ ngưỡng tắt.

export const TICK_MS = 2_000
/** Bản giả lập coi như node nhận ngưỡng mới sau chừng này (firmware V6 thật chưa nhận lệnh). */
export const APPLY_DELAY_MS = 4_000
/** Số lần đo bình thường liên tiếp để coi là "bình thường ổn định" (khoảng 20 giây). */
const STABLE_TICKS = 10

type RoomSim = {
  gasLeak: boolean
  fire: boolean
  unplugged: boolean
  /** Số đo node giữ lại khi mất mạng, gửi bù khi có mạng lại. */
  buffered: Measurement[]
  normalStreak: number
  gas: number
  temperature: number
  /** Mức gas mô phỏng muốn đạt; null là mức nền. */
  gasTarget: number | null
  /** Dấu hiệu nguy hiểm đang bật (giữ giữa các lần đo để có trễ bật/tắt). */
  active: Set<HazardSign>
}

const sims = new Map<string, RoomSim>()

function simOf(roomId: string): RoomSim {
  let sim = sims.get(roomId)
  if (!sim) {
    sim = {
      gasLeak: false,
      fire: false,
      unplugged: false,
      buffered: [],
      normalStreak: 0,
      gas: 200,
      temperature: 29.5,
      gasTarget: null,
      active: new Set(),
    }
    sims.set(roomId, sim)
  }
  return sim
}

/** Cập nhật dấu hiệu nguy hiểm theo ngưỡng node đang dùng. Cảm biến lỗi (null) giữ nguyên trạng thái cũ. */
function evaluateHazards(roomId: string, m: Measurement): HazardSign[] {
  const { active } = simOf(roomId)
  const t = thresholdOf(roomId).reported
  const step = (sign: HazardSign, value: number | null, on: number, off: number) => {
    if (value === null) return
    if (value >= on) active.add(sign)
    else if (value <= off) active.delete(sign)
  }
  step('gas', m.gas, t.gasOn, t.gasOff)
  step('high_temperature', m.temperature, t.tempOn, t.tempOff)
  if (m.flame === true) active.add('flame')
  else if (m.flame === false) active.delete('flame')
  return [...active]
}

export function currentHazards(roomId: string): HazardSign[] {
  const node = nodeOfRoom(roomId)
  if (!node || node.lifecycle !== 'active') return []
  return [...simOf(roomId).active]
}

function nextMeasurement(roomId: string, at: Date): Measurement {
  const sim = simOf(roomId)
  const node = nodeOfRoom(roomId)
  const base = baselineMeasurement(at, Math.random, roomId === 'r102' ? 1 : 0)
  // Gas và nhiệt độ đi dần về mục tiêu, không nhảy đột ngột.
  const gasTarget = sim.gasLeak ? 720 : (sim.gasTarget ?? base.gas ?? 200)
  const tempTarget = sim.fire ? 68 : (base.temperature ?? 29.5)
  sim.gas += (gasTarget - sim.gas) * 0.35
  sim.temperature += (tempTarget - sim.temperature) * 0.25
  const faulty = node?.faultySensors ?? new Set<SensorKind>()
  return {
    ...base,
    gas: faulty.has('gas') ? null : Math.round(sim.gas + (Math.random() - 0.5) * 12),
    temperature: faulty.has('temperature') ? null : Math.round(sim.temperature * 10) / 10,
    flame: faulty.has('flame') ? null : sim.fire,
  }
}

function recordIncident(roomId: string, m: Measurement) {
  const sim = simOf(roomId)
  const signs = evaluateHazards(roomId, m)
  const active = db.incidents.find((i) => i.roomId === roomId && i.status !== 'resolved')

  if (signs.length > 0) {
    sim.normalStreak = 0
    if (!active) {
      db.incidents.unshift({
        id: nextId('i'),
        roomId,
        signs,
        status: 'open',
        startedAt: m.measuredAt,
        resolvedAt: null,
        firstMeasurement: m,
        latestMeasurement: m,
        acknowledgements: [],
        events: [{ at: m.measuredAt, kind: 'detected', measurement: m, actor: null }],
      })
      return
    }
    active.signs = Array.from(new Set([...active.signs, ...signs]))
    active.latestMeasurement = m
    active.events.push({ at: m.measuredAt, kind: 'updated', measurement: m, actor: null })
    return
  }

  if (!active) return
  active.latestMeasurement = m
  sim.normalStreak += 1
  if (sim.normalStreak >= STABLE_TICKS) {
    active.status = 'resolved'
    active.resolvedAt = m.measuredAt
    active.events.push({ at: m.measuredAt, kind: 'resolved', measurement: null, actor: null })
  }
}

function tick() {
  const now = new Date()
  for (const room of db.rooms) {
    const node = nodeOfRoom(room.id)
    if (!node) continue
    const sim = simOf(room.id)
    const m = nextMeasurement(room.id, now)
    if (sim.unplugged) {
      sim.buffered.push({ ...m, isBackfill: true })
      continue
    }
    node.lastSeenAt = now.toISOString()
    // Node "nhận" ngưỡng mới sau APPLY_DELAY_MS khi đang có kết nối.
    const t = thresholdOf(room.id)
    if (
      t.updatedAt &&
      now.getTime() - Date.parse(t.updatedAt) >= APPLY_DELAY_MS &&
      connectivityOf(node) === 'online'
    ) {
      t.reported = { ...t.desired }
    }
    const list = db.measurements.get(room.id)
    if (list) list.push(m)
    else db.measurements.set(room.id, [m])
    // Node đang bảo trì vẫn gửi số đo nhưng không mở sự cố (edge case trong spec).
    if (node.lifecycle === 'active') recordIncident(room.id, m)
  }
}

let timer: ReturnType<typeof setInterval> | null = null

export function startSimulator() {
  if (timer) return
  tick()
  timer = setInterval(tick, TICK_MS)
}

/** Các kịch bản bấm được trên bảng mô phỏng (quickstart.md). */
export const scenarios = {
  gasLeak(roomId: string) {
    simOf(roomId).gasLeak = true
  },
  fire(roomId: string) {
    simOf(roomId).fire = true
  },
  /** Đưa gas về một mức cụ thể, để thử ngưỡng vừa đặt. */
  gasLevel(roomId: string, value: number | null) {
    simOf(roomId).gasTarget = value
  },
  recover(roomId: string) {
    const sim = simOf(roomId)
    sim.gasTarget = null
    sim.gasLeak = false
    sim.fire = false
    const node = nodeOfRoom(roomId)
    node?.faultySensors.clear()
  },
  breakSensor(roomId: string, kind: SensorKind) {
    nodeOfRoom(roomId)?.faultySensors.add(kind)
  },
  unplug(roomId: string) {
    simOf(roomId).unplugged = true
  },
  /** Cắm lại node; nếu backfill thì gửi bù số đo đã giữ trong lúc mất mạng. */
  replug(roomId: string, backfill = true) {
    const sim = simOf(roomId)
    sim.unplugged = false
    const receivedAt = new Date().toISOString()
    if (backfill && sim.buffered.length > 0) {
      const list = db.measurements.get(roomId) ?? []
      list.push(...sim.buffered.map((m) => ({ ...m, receivedAt })))
      list.sort((a, b) => a.measuredAt.localeCompare(b.measuredAt))
      db.measurements.set(roomId, list)
    }
    sim.buffered = []
  },
  state(roomId: string) {
    const sim = simOf(roomId)
    return { gasLeak: sim.gasLeak, fire: sim.fire, unplugged: sim.unplugged }
  },
}
