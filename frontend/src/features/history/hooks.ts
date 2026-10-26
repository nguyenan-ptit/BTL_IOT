import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { fetchHistory, historyKeys, type HistoryRange } from './api'

export function useMeasurements(roomId: string | null, range: HistoryRange) {
  const live = 'preset' in range
  return useQuery({
    queryKey: historyKeys.room(roomId ?? '', range),
    queryFn: ({ signal }) => fetchHistory(roomId!, range, signal),
    enabled: !!roomId,
    // Khoảng "đến hiện tại" thì kéo lại định kỳ để thấy số đo mới; khoảng tự chọn là dữ liệu cố định.
    refetchInterval: live ? (range.preset === '1h' ? 5_000 : 60_000) : false,
    placeholderData: keepPreviousData,
  })
}
