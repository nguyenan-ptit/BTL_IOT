import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { fetchHistory, historyKeys, type HistoryRange } from './api'

export function useMeasurements(deviceId: string | null, range: HistoryRange) {
  return useQuery({
    queryKey: historyKeys.device(deviceId ?? '', range),
    queryFn: ({ signal }) => fetchHistory(deviceId!, range, signal),
    enabled: !!deviceId,
    // "Mới nhất" thì kéo lại định kỳ để thấy số đo mới; khoảng tự chọn là dữ liệu cố định.
    refetchInterval: range === null ? 5_000 : false,
    placeholderData: keepPreviousData,
  })
}
