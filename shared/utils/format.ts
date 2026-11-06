// Italian formatting shared by the interface (useFormat) and the email templates, so a date reads
// the same on screen and in the inbox. Days are formatted as calendar days (no time zone shift);
// instants are shown in Italian time.
import { LOCALE, TIME_ZONE } from './constants'
import { daysBetween, todayIso, type IsoDay } from './dates'

type DayStyle = 'long' | 'short' | 'numeric'

const DAY_OPTIONS: Record<DayStyle, Intl.DateTimeFormatOptions> = {
  long: { day: 'numeric', month: 'long', year: 'numeric' },
  short: { day: 'numeric', month: 'short', year: 'numeric' },
  numeric: { day: '2-digit', month: '2-digit', year: 'numeric' },
}

const dayFormatters = new Map<string, Intl.DateTimeFormat>()
function dayFormatter(options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const key = JSON.stringify(options)
  let formatter = dayFormatters.get(key)
  if (!formatter) {
    formatter = new Intl.DateTimeFormat(LOCALE, { ...options, timeZone: 'UTC' })
    dayFormatters.set(key, formatter)
  }
  return formatter
}

function dayToDate(day: IsoDay): Date {
  return new Date(`${day}T00:00:00Z`)
}

/** "12 lug 2027" (short), "12 luglio 2027" (long), "12/07/2027" (numeric). Empty for no day. */
export function formatDay(day: IsoDay | null | undefined, style: DayStyle = 'short'): string {
  if (!day) return ''
  return dayFormatter(DAY_OPTIONS[style]).format(dayToDate(day))
}

/** "12–18 lug 2027", "30 giu – 5 lug 2027": the shared parts are written once. */
export function formatDayRange(start: IsoDay, end: IsoDay, style: Exclude<DayStyle, 'numeric'> = 'short'): string {
  if (start === end) return formatDay(start, style)
  return dayFormatter(DAY_OPTIONS[style]).formatRange(dayToDate(start), dayToDate(end))
}

/** "sabato 12 luglio". */
export function formatWeekday(day: IsoDay): string {
  return dayFormatter({ weekday: 'long', day: 'numeric', month: 'long' }).format(dayToDate(day))
}

/** "luglio 2027". */
export function formatMonth(day: IsoDay): string {
  return dayFormatter({ month: 'long', year: 'numeric' }).format(dayToDate(day))
}

const dateTimeFormatter = new Intl.DateTimeFormat(LOCALE, {
  timeZone: TIME_ZONE,
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
})

/** An instant in Italian time: "12 lug 2027, 14:05". */
export function formatDateTime(value: string | Date | null | undefined): string {
  if (!value) return ''
  const date = typeof value === 'string' ? new Date(value) : value
  return Number.isNaN(date.getTime()) ? '' : dateTimeFormatter.format(date)
}

/** "oggi", "domani", "ieri", "tra 5 giorni", "3 giorni fa". */
export function relativeDay(day: IsoDay, today: IsoDay = todayIso()): string {
  const diff = daysBetween(today, day)
  if (diff === 0) return 'oggi'
  if (diff === 1) return 'domani'
  if (diff === -1) return 'ieri'
  return diff > 0 ? `tra ${diff} giorni` : `${-diff} giorni fa`
}

/** "Mario Rossi". */
export function fullName(person: { firstName: string; lastName: string } | null | undefined): string {
  if (!person) return ''
  return `${person.firstName} ${person.lastName}`.trim()
}

/** Initials for avatars: "MR". */
export function initials(person: { firstName: string; lastName: string } | null | undefined): string {
  if (!person) return ''
  return `${person.firstName.charAt(0)}${person.lastName.charAt(0)}`.toUpperCase()
}

/** "1 famiglia", "3 famiglie". */
export function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`
}

const numberFormatter = new Intl.NumberFormat(LOCALE)

export function formatNumber(value: number): string {
  return numberFormatter.format(value)
}

/** "1,2 MB". */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024)
    return `${new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 0 }).format(bytes / 1024)} KB`
  return `${new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 1 }).format(bytes / (1024 * 1024))} MB`
}
