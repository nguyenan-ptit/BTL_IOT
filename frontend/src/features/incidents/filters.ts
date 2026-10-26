import {
  parseAsArrayOf,
  parseAsInteger,
  parseAsString,
  parseAsStringLiteral,
  useQueryStates,
} from 'nuqs'
import { incidentStatusSchema } from '@/shared/schemas/common'

// Bộ lọc danh sách sự cố nằm trên URL (research R5): ?phong=r101&tinh-trang=open,acknowledged&trang=2
export const incidentFilterParsers = {
  phong: parseAsString,
  'tinh-trang': parseAsArrayOf(parseAsStringLiteral(incidentStatusSchema.options)).withDefault([]),
  tu: parseAsString,
  den: parseAsString,
  trang: parseAsInteger.withDefault(1),
}

export function useIncidentFilters() {
  return useQueryStates(incidentFilterParsers, { history: 'replace' })
}
