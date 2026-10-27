import { useMemo } from 'react'
import {
  CartesianGrid,
  ReferenceLine,
  ComposedChart,
  Line,
  ReferenceArea,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { formatDate, formatDateTime, formatTime } from '@/shared/lib/datetime'
import { formatInteger, formatTemperature } from '@/shared/lib/number'
import type { ThresholdValues } from '@/features/thresholds/schemas'
import type { MeasurementHistory } from '../schemas'

/** Recharts vẽ SVG bằng thuộc tính, không đọc được var(--...), nên lấy giá trị màu thật từ theme. */
function themeColor(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(`--color-${name}`).trim()
}

type Point = { t: number; gas: number | null; temperature: number | null; backfill: boolean }

export function HistoryChart({
  data,
  spanMs,
  thresholds,
}: {
  data: MeasurementHistory
  spanMs: number
  /** Ngưỡng bật cảnh báo đang đặt của phòng (FR-044); không có với người thuê. */
  thresholds?: ThresholdValues
}) {
  const colors = useMemo(
    () => ({
      gas: themeColor('board-800'),
      temp: themeColor('ink-soft'),
      grid: themeColor('rule'),
      axis: themeColor('ink-faint'),
      alarm: themeColor('alarm'),
      offline: themeColor('offline'),
    }),
    [],
  )
  const points: Point[] = data.measurements.map((m) => ({
    t: Date.parse(m.measuredAt),
    gas: m.gas,
    temperature: m.temperature,
    backfill: m.isBackfill,
  }))
  const tick = (t: number) =>
    spanMs > 36 * 3_600_000
      ? formatDate(new Date(t)).slice(0, 5)
      : formatTime(new Date(t)).slice(0, 5)

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
        <span className="flex items-center gap-2">
          <span aria-hidden className="size-3 rounded-sm bg-alarm/25 ring-1 ring-alarm/50" />
          Có sự cố
        </span>
        <span className="flex items-center gap-2">
          <span
            aria-hidden
            className="hatch-offline size-3 rounded-sm bg-offline-wash ring-1 ring-offline/50"
          />
          Mất kết nối
        </span>
        <span className="flex items-center gap-2">
          <span aria-hidden className="size-2.5 rounded-full border-2 border-ink bg-sheet" />
          Số đo gửi bù
        </span>
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
            <defs>
              <pattern
                id="offline-hatch"
                width="8"
                height="8"
                patternUnits="userSpaceOnUse"
                patternTransform="rotate(-45)"
              >
                <rect width="8" height="8" fill={colors.offline} fillOpacity={0.08} />
                <line
                  x1="0"
                  y1="0"
                  x2="0"
                  y2="8"
                  stroke={colors.offline}
                  strokeOpacity={0.35}
                  strokeWidth="2"
                />
              </pattern>
            </defs>
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
            {data.offlineRanges.map((r) => (
              <ReferenceArea
                key={`off-${r.from}`}
                yAxisId="gas"
                x1={Date.parse(r.from)}
                x2={Date.parse(r.to)}
                fill="url(#offline-hatch)"
                ifOverflow="hidden"
              />
            ))}
            {data.incidents.map((i) => (
              <ReferenceArea
                key={`inc-${i.id}`}
                yAxisId="gas"
                x1={Date.parse(i.startedAt)}
                x2={
                  i.resolvedAt
                    ? Date.parse(i.resolvedAt)
                    : (points[points.length - 1]?.t ?? Date.parse(i.startedAt))
                }
                fill={colors.alarm}
                fillOpacity={0.14}
                stroke={colors.alarm}
                strokeOpacity={0.5}
                ifOverflow="hidden"
              />
            ))}
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
              dot={(props: { cx?: number; cy?: number; payload?: Point; index?: number }) =>
                props.payload?.backfill && props.cx !== undefined && props.cy !== undefined ? (
                  <circle
                    key={props.index}
                    cx={props.cx}
                    cy={props.cy}
                    r={3.5}
                    fill="white"
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
