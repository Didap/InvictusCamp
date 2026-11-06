import { TIME_ZONE } from './constants'

/** A day in Italy, 'YYYY-MM-DD'. ISO days compare correctly as strings. */
export type IsoDay = string

/** An inclusive range of days (sessions, availability periods). */
export interface DayRange {
  startDate: IsoDay
  endDate: IsoDay
}

export type Coverage = 'full' | 'partial' | 'none'

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/
const DAY_MS = 86_400_000

export function isIsoDay(value: unknown): value is IsoDay {
  if (typeof value !== 'string' || !DAY_RE.test(value)) return false
  const date = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
}

/** Today in Italy. */
export function todayIso(now: Date = new Date()): IsoDay {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now)
}

function toUtc(day: IsoDay): number {
  return Date.UTC(Number(day.slice(0, 4)), Number(day.slice(5, 7)) - 1, Number(day.slice(8, 10)))
}

function fromUtc(ms: number): IsoDay {
  return new Date(ms).toISOString().slice(0, 10)
}

export function addDays(day: IsoDay, days: number): IsoDay {
  return fromUtc(toUtc(day) + days * DAY_MS)
}

/** Whole days from `from` to `to` (negative when `to` comes first). */
export function daysBetween(from: IsoDay, to: IsoDay): number {
  return Math.round((toUtc(to) - toUtc(from)) / DAY_MS)
}

/** Days in an inclusive range: 12 to 18 July is 7 days. */
export function dayCount(range: DayRange): number {
  return daysBetween(range.startDate, range.endDate) + 1
}

/** True when two inclusive ranges share at least one day. */
export function rangesOverlap(a: DayRange, b: DayRange): boolean {
  return a.startDate <= b.endDate && b.startDate <= a.endDate
}

/**
 * How much of `target` the ranges cover, counting inclusive days: every day ('full'), some days
 * ('partial') or none. Used to match staff availability against the dates of a session.
 */
export function rangeCoverage(ranges: DayRange[], target: DayRange): Coverage {
  const clipped = ranges
    .filter(range => rangesOverlap(range, target))
    .map(range => ({
      start: range.startDate < target.startDate ? target.startDate : range.startDate,
      end: range.endDate > target.endDate ? target.endDate : range.endDate,
    }))
    .sort((a, b) => a.start.localeCompare(b.start))
  if (!clipped.length) return 'none'
  // `cursor` is the first day of the target not yet covered.
  let cursor = target.startDate
  for (const range of clipped) {
    if (range.start > cursor) return 'partial'
    if (range.end >= cursor) cursor = addDays(range.end, 1)
    if (cursor > target.endDate) return 'full'
  }
  return cursor > target.endDate ? 'full' : 'partial'
}

/** The first and last day of the month that contains `day`. */
export function monthBounds(day: IsoDay): DayRange {
  const year = Number(day.slice(0, 4))
  const month = Number(day.slice(5, 7))
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate()
  const mm = String(month).padStart(2, '0')
  return { startDate: `${year}-${mm}-01`, endDate: `${year}-${mm}-${String(last).padStart(2, '0')}` }
}

/** Day of the week, Monday = 0 … Sunday = 6. */
export function weekdayIndex(day: IsoDay): number {
  return (new Date(toUtc(day)).getUTCDay() + 6) % 7
}
