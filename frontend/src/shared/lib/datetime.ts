// Mọi ngày giờ trên website hiện theo giờ Việt Nam (FR-036). Không gọi Intl hay toLocale* ở chỗ khác.
const TIME_ZONE = 'Asia/Ho_Chi_Minh'
const LOCALE = 'vi-VN'

const dateTimeFormat = new Intl.DateTimeFormat(LOCALE, {
  timeZone: TIME_ZONE,
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
})

const timeFormat = new Intl.DateTimeFormat(LOCALE, {
  timeZone: TIME_ZONE,
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
})

const dateFormat = new Intl.DateTimeFormat(LOCALE, {
  timeZone: TIME_ZONE,
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
})

function toDate(value: string | Date): Date {
  return typeof value === 'string' ? new Date(value) : value
}

function part(parts: Intl.DateTimeFormatPart[], type: Intl.DateTimeFormatPartTypes): string {
  return parts.find((p) => p.type === type)?.value ?? ''
}

/** 26/10/2026 14:30:05 */
export function formatDateTime(value: string | Date): string {
  const parts = dateTimeFormat.formatToParts(toDate(value))
  return `${part(parts, 'day')}/${part(parts, 'month')}/${part(parts, 'year')} ${part(parts, 'hour')}:${part(parts, 'minute')}:${part(parts, 'second')}`
}

/** 14:30:05 */
export function formatTime(value: string | Date): string {
  const parts = timeFormat.formatToParts(toDate(value))
  return `${part(parts, 'hour')}:${part(parts, 'minute')}:${part(parts, 'second')}`
}

/** 26/10/2026 */
export function formatDate(value: string | Date): string {
  const parts = dateFormat.formatToParts(toDate(value))
  return `${part(parts, 'day')}/${part(parts, 'month')}/${part(parts, 'year')}`
}

/** Giờ đến phút: "14:58" nếu cùng ngày với `now`, "08/11 23:30" nếu khác ngày. */
export function formatClock(value: string | Date, now: Date = new Date()): string {
  const parts = dateTimeFormat.formatToParts(toDate(value))
  const clock = `${part(parts, 'hour')}:${part(parts, 'minute')}`
  if (formatDate(value) === formatDate(now)) return clock
  return `${part(parts, 'day')}/${part(parts, 'month')} ${clock}`
}
