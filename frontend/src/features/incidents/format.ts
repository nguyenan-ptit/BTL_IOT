import type { Measurement } from '@/features/history/schemas'
import { hazardSignLabel } from '@/shared/lib/labels'
import { formatInteger, formatTemperature } from '@/shared/lib/number'
import type { HazardSign } from '@/shared/schemas/common'

export function signsText(signs: HazardSign[]): string {
  return signs.map((s) => hazardSignLabel[s]).join(', ')
}

/** "Gas 575 · 28,3 °C · Có lửa" */
export function measurementText(m: Measurement): string {
  const parts: string[] = []
  parts.push(m.gas === null ? 'Gas: lỗi' : `Gas ${formatInteger(m.gas)}`)
  parts.push(m.temperature === null ? 'Nhiệt độ: lỗi' : formatTemperature(m.temperature))
  parts.push(m.flame === null ? 'Lửa: lỗi' : m.flame ? 'Có lửa' : 'Không có lửa')
  return parts.join(' · ')
}
