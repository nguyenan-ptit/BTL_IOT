import { useQuery } from '@tanstack/react-query'
import { LIVE_REFETCH_MS } from '@/features/rooms/hooks'
import { deviceKeys, fetchDevices } from './api'
import type { DeviceItem } from './schemas'

type Interval = number | ((items: DeviceItem[] | undefined) => number)

export function useDevices(options: { refetchInterval?: Interval } = {}) {
  const interval = options.refetchInterval ?? LIVE_REFETCH_MS
  return useQuery({
    queryKey: deviceKeys.list,
    queryFn: ({ signal }) => fetchDevices(signal),
    refetchInterval:
      typeof interval === 'number' ? interval : (query) => interval(query.state.data),
  })
}
