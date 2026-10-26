import {
  CircleCheck,
  CircleDashed,
  Siren,
  TriangleAlert,
  WifiOff,
  Wrench,
  type LucideIcon,
} from 'lucide-react'
import type { RoomOverall } from '@/shared/schemas/common'
import { roomOverallLabel } from '@/shared/lib/labels'

// Mỗi trạng thái có đúng một ký hiệu (màu + icon + chữ), dùng giống nhau ở mọi màn hình.
export type StatusStyle = {
  label: string
  icon: LucideIcon
  /** Chữ và icon của nhãn trạng thái. */
  pill: string
  /** Viền và nền của thẻ phòng. */
  card: string
  /** Chấm màu đặc, dùng trong bảng và biểu đồ. */
  dot: string
}

export const roomStatusStyle: Record<RoomOverall, StatusStyle> = {
  alarm: {
    label: roomOverallLabel.alarm,
    icon: Siren,
    pill: 'bg-alarm text-white',
    card: 'border-alarm bg-alarm-wash',
    dot: 'bg-alarm',
  },
  offline: {
    label: roomOverallLabel.offline,
    icon: WifiOff,
    pill: 'bg-offline-wash text-offline-ink ring-1 ring-inset ring-offline/40',
    card: 'border-offline/50 bg-offline-wash hatch-offline',
    dot: 'bg-offline',
  },
  sensor_fault: {
    label: roomOverallLabel.sensor_fault,
    icon: TriangleAlert,
    pill: 'bg-fault text-ink',
    card: 'border-fault bg-fault-wash',
    dot: 'bg-fault',
  },
  maintenance: {
    label: roomOverallLabel.maintenance,
    icon: Wrench,
    pill: 'bg-maintenance-wash text-maintenance-ink ring-1 ring-inset ring-maintenance/40',
    card: 'border-maintenance/50 bg-maintenance-wash',
    dot: 'bg-maintenance',
  },
  normal: {
    label: roomOverallLabel.normal,
    icon: CircleCheck,
    pill: 'bg-normal-wash text-normal-ink ring-1 ring-inset ring-normal/40',
    card: 'border-rule bg-sheet',
    dot: 'bg-normal',
  },
  no_device: {
    label: roomOverallLabel.no_device,
    icon: CircleDashed,
    pill: 'bg-ground text-ink-soft ring-1 ring-inset ring-rule-strong',
    card: 'border-dashed border-rule-strong bg-ground',
    dot: 'bg-ink-faint',
  },
}
