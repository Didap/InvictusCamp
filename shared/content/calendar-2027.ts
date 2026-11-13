/**
 * The 2027 calendar the camp sent on 11/11/2026: 25 sessions numbered through the year, weekends (Friday
 * to Sunday) in spring and autumn, weeks (Monday to Friday) in summer. Their sheet numbered the autumn
 * weekends again from 17; William chose one numbering for the whole year (S19-S25).
 *
 * Type imports only: scripts/create-calendar.mjs loads this file with Node's type stripping, which erases
 * them but cannot resolve the app's other imports.
 */
import type { SessionStatus } from '../utils/constants'
import type { DayRange } from '../utils/dates'

export interface CalendarSession extends DayRange {
  number: number
  /** What the title says after the number: "Weekend di primavera", "Settimana estiva", "Weekend d’autunno". */
  label: string
}

const GROUPS: [label: string, days: [start: string, end: string][]][] = [
  [
    'Weekend di primavera',
    [
      ['2027-04-23', '2027-04-25'],
      ['2027-04-30', '2027-05-02'],
      ['2027-05-07', '2027-05-09'],
      ['2027-05-14', '2027-05-16'],
      ['2027-05-21', '2027-05-23'],
    ],
  ],
  [
    'Settimana estiva',
    [
      ['2027-05-31', '2027-06-04'],
      ['2027-06-07', '2027-06-11'],
      ['2027-06-14', '2027-06-18'],
      ['2027-06-21', '2027-06-25'],
      ['2027-06-28', '2027-07-02'],
      ['2027-07-12', '2027-07-16'],
      ['2027-07-19', '2027-07-23'],
      ['2027-07-26', '2027-07-30'],
      ['2027-08-02', '2027-08-06'],
      ['2027-08-16', '2027-08-20'],
      ['2027-08-23', '2027-08-27'],
      ['2027-08-30', '2027-09-03'],
      ['2027-09-06', '2027-09-10'],
    ],
  ],
  [
    // The sheet wrote the first one as "17/08-19/09".
    'Weekend d’autunno',
    [
      ['2027-09-17', '2027-09-19'],
      ['2027-09-24', '2027-09-26'],
      ['2027-10-01', '2027-10-03'],
      ['2027-10-08', '2027-10-10'],
      ['2027-10-15', '2027-10-17'],
      ['2027-10-22', '2027-10-24'],
      ['2027-10-29', '2027-10-31'],
    ],
  ],
]

export const CALENDAR_2027: readonly CalendarSession[] = GROUPS.flatMap(([label, days]) =>
  days.map(([startDate, endDate]) => ({ label, startDate, endDate })),
).map((session, i) => ({ number: i + 1, ...session }))

/**
 * "Sessione 19 · Weekend d’autunno". No dates: every list and page, and the body of every email, show them
 * beside the title.
 */
export function calendarTitle(session: CalendarSession): string {
  return `Sessione ${session.number} · ${session.label}`
}

/** The number calendarTitle put in a title («Sessione 7 · …»), or null. */
export function calendarNumber(title: string): number | null {
  const number = Number(/^Sessione (\d+)\b/.exec(title)?.[1])
  return number || null
}

export interface ExistingSession extends DayRange {
  title: string
  status: SessionStatus
}

export interface CalendarPlan {
  create: CalendarSession[]
  skipped: { session: CalendarSession; by: ExistingSession }[]
}

/**
 * Which calendar sessions a database still needs. One is skipped when a session there has its title, in any
 * status (a session the camp cancelled or moved stays as they left it), or when a session not cancelled
 * overlaps its days (as rangesOverlap in shared/utils/dates, which this file cannot import).
 */
export function calendarPlan(existing: readonly ExistingSession[]): CalendarPlan {
  const plan: CalendarPlan = { create: [], skipped: [] }
  for (const session of CALENDAR_2027) {
    const title = calendarTitle(session)
    const by =
      existing.find(row => row.title === title) ??
      existing.find(
        row => row.status !== 'cancelled' && row.startDate <= session.endDate && row.endDate >= session.startDate,
      )
    if (by) plan.skipped.push({ session, by })
    else plan.create.push(session)
  }
  return plan
}
