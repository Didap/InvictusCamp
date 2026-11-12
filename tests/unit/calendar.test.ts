import { describe, expect, it } from 'vitest'
import { CALENDAR_2027, calendarTitle } from '~~/shared/content/calendar-2027'
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
