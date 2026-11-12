/**
 * The 2027 calendar the camp sent on 11/11/2026: 25 sessions numbered through the year, weekends (Friday
 * to Sunday) in spring and autumn, weeks (Monday to Friday) in summer. Their sheet numbered the autumn
 * weekends again from 17; William chose one numbering for the whole year (S19-S25).
 *
 * No imports: scripts/create-calendar.mjs loads this file with Node's type stripping.
 */

export type CalendarKind = 'weekend' | 'week'

export interface CalendarSession {
  number: number
  kind: CalendarKind
  startDate: string
  endDate: string
}

const SESSIONS: [CalendarKind, string, string][] = [
  // Spring weekends
  ['weekend', '2027-04-23', '2027-04-25'],
  ['weekend', '2027-04-30', '2027-05-02'],
  ['weekend', '2027-05-07', '2027-05-09'],
  ['weekend', '2027-05-14', '2027-05-16'],
  ['weekend', '2027-05-21', '2027-05-23'],
  // Summer weeks
  ['week', '2027-05-31', '2027-06-04'],
  ['week', '2027-06-07', '2027-06-11'],
  ['week', '2027-06-14', '2027-06-18'],
  ['week', '2027-06-21', '2027-06-25'],
  ['week', '2027-06-28', '2027-07-02'],
  ['week', '2027-07-12', '2027-07-16'],
  ['week', '2027-07-19', '2027-07-23'],
  ['week', '2027-07-26', '2027-07-30'],
  ['week', '2027-08-02', '2027-08-06'],
  ['week', '2027-08-16', '2027-08-20'],
  ['week', '2027-08-23', '2027-08-27'],
  ['week', '2027-08-30', '2027-09-03'],
  ['week', '2027-09-06', '2027-09-10'],
  // Autumn weekends (the sheet wrote the first one as "17/08-19/09")
  ['weekend', '2027-09-17', '2027-09-19'],
  ['weekend', '2027-09-24', '2027-09-26'],
  ['weekend', '2027-10-01', '2027-10-03'],
  ['weekend', '2027-10-08', '2027-10-10'],
  ['weekend', '2027-10-15', '2027-10-17'],
  ['weekend', '2027-10-22', '2027-10-24'],
  ['weekend', '2027-10-29', '2027-10-31'],
]

export const CALENDAR_2027: readonly CalendarSession[] = SESSIONS.map(([kind, startDate, endDate], i) => ({
  number: i + 1,
  kind,
  startDate,
  endDate,
}))

/**
 * "Sessione 19 · Weekend d’autunno", "Sessione 6 · Settimana estiva". No dates: every list, page and email
 * shows them beside the title.
 */
export function calendarTitle(session: CalendarSession): string {
  const kind =
    session.kind === 'week'
      ? 'Settimana estiva'
      : session.startDate.slice(5) < '07-01'
        ? 'Weekend di primavera'
        : 'Weekend d’autunno'
  return `Sessione ${session.number} · ${kind}`
}

export interface ExistingSession {
  title: string
  status: string
  startDate: string
  endDate: string
}

/**
 * Which calendar sessions a database still needs. One is skipped when a session there has its title, in any
 * status (a session the camp cancelled or moved stays as they left it), or when a session not cancelled
 * overlaps its days.
 */
export function calendarPlan(existing: readonly ExistingSession[]): {
  create: CalendarSession[]
  skipped: { session: CalendarSession; by: ExistingSession }[]
} {
  const create: CalendarSession[] = []
  const skipped: { session: CalendarSession; by: ExistingSession }[] = []
  for (const session of CALENDAR_2027) {
    const title = calendarTitle(session)
    const by =
      existing.find(row => row.title === title) ??
      existing.find(
        row => row.status !== 'cancelled' && row.startDate <= session.endDate && row.endDate >= session.startDate,
      )
    if (by) skipped.push({ session, by })
    else create.push(session)
  }
  return { create, skipped }
}
