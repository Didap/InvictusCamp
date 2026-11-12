import { spawnSync } from 'node:child_process'
import { describe, expect, it } from 'vitest'
import { CALENDAR_2027, calendarPlan, calendarTitle } from '~~/shared/content/calendar-2027'
import { weekdayIndex } from '~~/shared/utils/dates'

describe('calendar 2027', () => {
  it('numbers 25 sessions through the year, in order and without overlaps', () => {
    expect(CALENDAR_2027.map(s => s.number)).toEqual(Array.from({ length: 25 }, (_, i) => i + 1))
    for (const [i, session] of CALENDAR_2027.entries()) {
      if (i > 0) expect(session.startDate > CALENDAR_2027[i - 1]!.endDate).toBe(true)
    }
  })

  it('has weekends from Friday to Sunday and weeks from Monday to Friday', () => {
    for (const { kind, startDate, endDate } of CALENDAR_2027) {
      const [start, end] = kind === 'weekend' ? [4, 6] : [0, 4]
      expect([weekdayIndex(startDate), weekdayIndex(endDate)], `${startDate}`).toEqual([start, end])
    }
    const kinds = CALENDAR_2027.map(s => s.kind)
    expect(kinds.filter(k => k === 'weekend')).toHaveLength(12)
    expect(kinds.slice(5, 18).every(k => k === 'week')).toBe(true)
  })

  it('titles a session with its number and kind', () => {
    const title = (n: number) => calendarTitle(CALENDAR_2027[n - 1]!)
    expect(title(5)).toBe('Sessione 5 · Weekend di primavera')
    expect(title(6)).toBe('Sessione 6 · Settimana estiva')
    expect(title(18)).toBe('Sessione 18 · Settimana estiva')
    expect(title(19)).toBe('Sessione 19 · Weekend d’autunno')
    expect(new Set(CALENDAR_2027.map(calendarTitle)).size).toBe(25)
  })
})

describe('calendarPlan', () => {
  const s = (n: number) => CALENDAR_2027[n - 1]!
  const row = (title: string, startDate: string, endDate: string, status = 'draft') => ({
    title,
    status,
    startDate,
    endDate,
  })
  const created = (plan: ReturnType<typeof calendarPlan>) => plan.create.map(c => c.number)

  it('creates every session in an empty database and none once they are there', () => {
    expect(created(calendarPlan([]))).toHaveLength(25)
    const all = CALENDAR_2027.map(c => row(calendarTitle(c), c.startDate, c.endDate))
    expect(calendarPlan(all)).toMatchObject({ create: [], skipped: { length: 25 } })
  })

  it('leaves alone a session the camp cancelled or moved, found by its title', () => {
    const plan = calendarPlan([
      row(calendarTitle(s(3)), s(3).startDate, s(3).endDate, 'cancelled'),
      row(calendarTitle(s(10)), '2027-07-05', '2027-07-09'),
    ])
    expect(created(plan)).not.toContain(3)
    expect(created(plan)).not.toContain(10)
    expect(plan.create).toHaveLength(23)
  })

  it('skips the days another session takes, unless it was cancelled, edges included', () => {
    const plan = calendarPlan([
      row('Sessione a mano', '2027-06-25', '2027-06-28'), // last day of S9, first of S10
      row('Annullata', s(1).startDate, s(1).endDate, 'cancelled'),
      row('Il giorno prima', '2027-04-29', '2027-04-29'),
    ])
    expect(plan.skipped.map(x => [x.session.number, x.by.title])).toEqual([
      [9, 'Sessione a mano'],
      [10, 'Sessione a mano'],
    ])
    expect(created(plan)).toContain(1)
    expect(created(plan)).toContain(2)
  })
})

describe('scripts/create-calendar.mjs', () => {
  it('loads its .ts modules under plain Node (type stripping, no imports in them)', () => {
    const run = spawnSync(process.execPath, ['scripts/create-calendar.mjs'], {
      env: { PATH: process.env.PATH },
      encoding: 'utf8',
    })
    expect(run.stderr.trim()).toBe('create-calendar: DATABASE_URL is not set')
  })
})
