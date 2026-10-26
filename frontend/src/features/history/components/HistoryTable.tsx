import { useState } from 'react'
import { formatDateTime } from '@/shared/lib/datetime'
import { formatInteger, formatTemperature } from '@/shared/lib/number'
import { Button } from '@/shared/ui/Button'
import type { Measurement } from '../schemas'

const PAGE = 50

/** Bảng số đo cùng dữ liệu với biểu đồ (FR-020), mới nhất ở trên. */
export function HistoryTable({ measurements }: { measurements: Measurement[] }) {
  const [shown, setShown] = useState(PAGE)
  const rows = [...measurements].reverse()

  return (
    <div className="flex flex-col gap-3">
      <div className="overflow-x-auto rounded-[var(--radius-sheet)] border border-rule bg-sheet">
        <table className="w-full min-w-[32rem] text-sm">
          <caption className="sr-only">Bảng số đo, mới nhất ở trên</caption>
          <thead className="border-b border-rule bg-ground text-left text-ink-soft">
            <tr>
              <th scope="col" className="px-3 py-2 font-semibold">
                Thời điểm đo
              </th>
              <th scope="col" className="px-3 py-2 text-right font-semibold">
                Gas/khói
              </th>
              <th scope="col" className="px-3 py-2 text-right font-semibold">
                Nhiệt độ
              </th>
              <th scope="col" className="px-3 py-2 font-semibold">
                Lửa
              </th>
              <th scope="col" className="px-3 py-2 font-semibold">
                Nguồn
              </th>
            </tr>
          </thead>
          <tbody className="tabular">
            {rows.slice(0, shown).map((m) => (
              <tr key={m.measuredAt} className="border-b border-rule last:border-0">
                <td className="px-3 py-2 whitespace-nowrap">{formatDateTime(m.measuredAt)}</td>
                <td className="px-3 py-2 text-right">
                  {m.gas === null ? (
                    <span className="text-fault-ink">Lỗi</span>
                  ) : (
                    formatInteger(m.gas)
                  )}
                </td>
                <td className="px-3 py-2 text-right whitespace-nowrap">
                  {m.temperature === null ? (
                    <span className="text-fault-ink">Lỗi</span>
                  ) : (
                    formatTemperature(m.temperature)
                  )}
                </td>
                <td className="px-3 py-2">
                  {m.flame === null ? (
                    <span className="text-fault-ink">Lỗi</span>
                  ) : m.flame ? (
                    <span className="font-semibold text-alarm-deep">Có lửa</span>
                  ) : (
                    'Không'
                  )}
                </td>
                <td className="px-3 py-2 whitespace-nowrap">
                  {m.isBackfill ? (
                    <span className="font-semibold">Gửi bù</span>
                  ) : (
                    <span className="text-ink-faint">Trực tiếp</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {shown < rows.length && (
        <Button
          variant="secondary"
          size="sm"
          className="self-start"
          onClick={() => setShown((n) => n + PAGE)}
        >
          Hiện thêm ({rows.length - shown} dòng)
        </Button>
      )}
    </div>
  )
}
