import { CircleDot, CirclePause, CircleSlash, PlayCircle, Wifi, WifiOff } from 'lucide-react'
import { connectivityLabel, nodeLifecycleLabel } from '@/shared/lib/labels'
import type { Connectivity, NodeLifecycle } from '@/shared/schemas/common'
import { cn } from '@/shared/ui/cn'

const lifecycleStyle: Record<NodeLifecycle, { icon: typeof CircleDot; className: string }> = {
  registered: { icon: CircleDot, className: 'bg-ground text-ink-soft ring-rule-strong' },
  active: { icon: PlayCircle, className: 'bg-normal-wash text-normal-ink ring-normal/40' },
  maintenance: {
    icon: CirclePause,
    className: 'bg-maintenance-wash text-maintenance-ink ring-maintenance/40',
  },
  retired: {
    icon: CircleSlash,
    className: 'bg-ground text-ink-faint ring-rule',
  },
}

const pill =
  'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-sm leading-none font-semibold whitespace-nowrap ring-1 ring-inset'

export function LifecyclePill({ lifecycle }: { lifecycle: NodeLifecycle }) {
  const { icon: Icon, className } = lifecycleStyle[lifecycle]
  return (
    <span className={cn(pill, className)}>
      <Icon aria-hidden className="size-4" />
      {nodeLifecycleLabel[lifecycle]}
    </span>
  )
}

export function ConnectivityText({ connectivity }: { connectivity: Connectivity }) {
  const Icon = connectivity === 'online' ? Wifi : WifiOff
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 text-sm font-semibold',
        connectivity === 'online' ? 'text-normal-ink' : 'text-offline-ink',
      )}
    >
      <Icon aria-hidden className="size-4" />
      {connectivityLabel[connectivity]}
    </span>
  )
}
