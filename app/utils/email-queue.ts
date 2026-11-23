import type { EmailDeparture } from '#shared/types/communications'
import { addDays, todayIso } from '#shared/utils/dates'
import { formatDay } from '#shared/utils/format'

/** «A breve», «Oggi alle 23:59», «Domani dalle 8:00», «27 nov dalle 8:00». */
export function departureLabel({ day, time }: EmailDeparture): string {
  if (time === 'now') return 'A breve'
  const today = todayIso()
  const when = day === today ? 'Oggi' : day === addDays(today, 1) ? 'Domani' : formatDay(day)
  return `${when} ${time === '08:00' ? 'dalle 8:00' : 'alle 23:59'}`
}
