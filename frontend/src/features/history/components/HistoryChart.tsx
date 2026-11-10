import { useMemo } from 'react'
import {
  CartesianGrid,
  ReferenceLine,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { formatDate, formatDateTime, formatTime } from '@/shared/lib/datetime'
import { formatInteger, formatTemperature } from '@/shared/lib/number'
import type { ThresholdValues } from '@/features/thresholds/schemas'
import type { Measurement } from '../schemas'

/** Recharts vẽ SVG bằng thuộc tính, không đọc được var(--...), nên lấy giá trị màu thật từ theme. */
function themeColor(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(`--color-${name}`).trim()
}

type Point = { t: number; gas: number | null; temperature: number | null; backfill: boolean }

export function HistoryChart({
  measurements,
  thresholds,
}: {
  measurements: Measurement[]
  /** Ngưỡng bật cảnh báo node đang dùng, đọc từ telemetry mới nhất. */
  thresholds: ThresholdValues | null
}) {
  const colors = useMemo(
    () => ({
      gas: themeColor('board-800'),
      temp: themeColor('ink-soft'),
      grid: themeColor('rule'),
      axis: themeColor('ink-faint'),
      alarm: themeColor('alarm'),
      sheet: themeColor('sheet'),
    }),
    [],
  )
  const points: Point[] = measurements.map((m) => ({
    t: Date.parse(m.measuredAt),
    gas: m.gas,
    temperature: m.temperature,
    backfill: m.isBackfill,
  }))
  const hasBackfill = points.some((p) => p.backfill)
  const first = points[0]?.t ?? 0
  const last = points[points.length - 1]?.t ?? 0
  const sameDay = formatDate(new Date(first)) === formatDate(new Date(last))
  // Khoảng ngắn (vài phút) nên hiện cả giây; khác ngày thì thêm ngày/tháng.
  const tick = (t: number) =>
    sameDay
      ? formatTime(new Date(t))
      : `${formatDate(new Date(t)).slice(0, 5)} ${formatTime(new Date(t)).slice(0, 5)}`

  return (
    <figure className="flex flex-col gap-3">
      <figcaption className="flex flex-wrap items-center gap-x-5 gap-y-1 text-sm text-ink-soft">
        <span className="flex items-center gap-2">
          <span aria-hidden className="h-0.5 w-5 bg-board-800" />
          Gas/khói (trục trái)
        </span>
        <span className="flex items-center gap-2">
          <span aria-hidden className="w-5 border-t-2 border-dashed border-ink-soft" />
          Nhiệt độ °C (trục phải)
        </span>
        {hasBackfill && (
          <span className="flex items-center gap-2">
            <span aria-hidden className="size-2.5 rounded-full border-2 border-ink bg-sheet" />
            Số đo gửi bù
          </span>
        )}
        {thresholds && (
          <span className="flex items-center gap-2">
            <span aria-hidden className="w-5 border-t-2 border-dotted border-alarm" />
            Ngưỡng bật cảnh báo
          </span>
        )}
      </figcaption>
      <div
        className="h-72 w-full sm:h-80"
        role="img"
        aria-label="Biểu đồ gas và nhiệt độ theo thời gian; số liệu chi tiết ở bảng bên dưới"
      >
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={points} margin={{ top: 8, right: 4, bottom: 0, left: -12 }}>
            <CartesianGrid stroke={colors.grid} vertical={false} />
            <XAxis
              dataKey="t"
              type="number"
              scale="time"
              domain={['dataMin', 'dataMax']}
              tickFormatter={tick}
              stroke={colors.axis}
              tick={{ fontSize: 12 }}
              minTickGap={28}
            />
            <YAxis
              yAxisId="gas"
              tickFormatter={(v: number) => formatInteger(v)}
              stroke={colors.axis}
              tick={{ fontSize: 12 }}
              width={48}
            />
            <YAxis
              yAxisId="temp"
              orientation="right"
              tickFormatter={(v: number) => formatTemperature(v).replace(' °C', '')}
              stroke={colors.axis}
              tick={{ fontSize: 12 }}
              width={40}
              domain={['auto', 'auto']}
            />
            {thresholds && (
              <ReferenceLine
                yAxisId="gas"
                y={thresholds.gasOn}
                stroke={colors.alarm}
                strokeDasharray="2 3"
                ifOverflow="extendDomain"
                label={{
                  value: `Ngưỡng gas ${formatInteger(thresholds.gasOn)}`,
                  position: 'insideTopLeft',
                  fontSize: 11,
                  fill: colors.alarm,
                }}
              />
            )}
            {thresholds && (
              <ReferenceLine
                yAxisId="temp"
                y={thresholds.tempOn}
                stroke={colors.temp}
                strokeDasharray="2 3"
                ifOverflow="extendDomain"
                label={{
                  value: `Ngưỡng ${formatTemperature(thresholds.tempOn)}`,
                  position: 'insideTopRight',
                  fontSize: 11,
                  fill: colors.temp,
                }}
              />
            )}
            <Tooltip
              labelFormatter={(t) => formatDateTime(new Date(Number(t)))}
              formatter={(value, name) =>
                name === 'gas'
                  ? [value === null ? 'lỗi' : formatInteger(Number(value)), 'Gas/khói']
                  : [value === null ? 'lỗi' : formatTemperature(Number(value)), 'Nhiệt độ']
              }
            />
            <Line
              yAxisId="gas"
              dataKey="gas"
              name="gas"
              stroke={colors.gas}
              strokeWidth={2}
              isAnimationActive={false}
              connectNulls={false}
              // Chấm rỗng đánh dấu số đo gửi bù (đo lúc mất mạng, nhận sau).
              dot={(props: { cx?: number; cy?: number; payload?: Point; index?: number }) =>
                props.payload?.backfill && props.cx !== undefined && props.cy !== undefined ? (
                  <circle
                    key={props.index}
                    cx={props.cx}
                    cy={props.cy}
                    r={3.5}
                    fill={colors.sheet}
                    stroke={colors.gas}
                    strokeWidth={2}
                  />
                ) : (
                  <g key={props.index} />
                )
              }
            />
            <Line
              yAxisId="temp"
              dataKey="temperature"
              name="temperature"
              stroke={colors.temp}
              strokeWidth={2}
              strokeDasharray="5 4"
              dot={false}
              isAnimationActive={false}
              connectNulls={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </figure>
  )
}
