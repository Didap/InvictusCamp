import { describe, expect, it } from 'vitest'
import {
  addDays,
  dayCount,
  daysBetween,
  isIsoDay,
  monthBounds,
  rangeCoverage,
  rangesOverlap,
  todayIso,
  weekdayIndex,
} from '#shared/utils/dates'
import { formatDayRange } from '#shared/utils/format'

const session = { startDate: '2027-06-21', endDate: '2027-06-27' }

describe('dates', () => {
  it('moves across months and years', () => {
    expect(addDays('2027-06-30', 1)).toBe('2027-07-01')
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDays('2027-03-01', -1)).toBe('2027-02-28')
    expect(daysBetween('2027-06-21', '2027-06-27')).toBe(6)
    expect(dayCount(session)).toBe(7)
  })

  it('validates ISO days', () => {
    expect(isIsoDay('2027-02-28')).toBe(true)
    expect(isIsoDay('2027-02-30')).toBe(false)
    expect(isIsoDay('27-02-2027')).toBe(false)
  })

  it('knows today in Italy, not in UTC', () => {
    expect(todayIso(new Date('2026-06-30T23:30:00Z'))).toBe('2026-07-01')
    expect(todayIso(new Date('2026-12-31T22:59:00Z'))).toBe('2026-12-31')
  })

  it('bounds months, leap years included', () => {
    expect(monthBounds('2028-02-10')).toEqual({ startDate: '2028-02-01', endDate: '2028-02-29' })
    expect(weekdayIndex('2026-11-06')).toBe(4) // a Friday
  })

  it('detects overlaps on inclusive ranges', () => {
    expect(rangesOverlap(session, { startDate: '2027-06-27', endDate: '2027-07-02' })).toBe(true)
    expect(rangesOverlap(session, { startDate: '2027-06-28', endDate: '2027-07-02' })).toBe(false)
  })

  it('measures how availability covers a session', () => {
    expect(rangeCoverage([{ startDate: '2027-06-01', endDate: '2027-06-30' }], session)).toBe('full')
    expect(
      rangeCoverage(
        [
          { startDate: '2027-06-21', endDate: '2027-06-23' },
          { startDate: '2027-06-24', endDate: '2027-06-27' },
        ],
        session,
      ),
    ).toBe('full')
    expect(
      rangeCoverage(
        [
          { startDate: '2027-06-21', endDate: '2027-06-23' },
          { startDate: '2027-06-25', endDate: '2027-06-27' },
        ],
        session,
      ),
    ).toBe('partial')
    expect(rangeCoverage([{ startDate: '2027-06-24', endDate: '2027-07-20' }], session)).toBe('partial')
    expect(rangeCoverage([{ startDate: '2027-08-01', endDate: '2027-09-30' }], session)).toBe('none')
    expect(rangeCoverage([], session)).toBe('none')
  })
})

describe('formatDayRange', () => {
  it('writes days without a leading zero, like formatDay', () => {
    // ICU puts thin spaces (U+2009) around the dash when the months differ.
    expect(formatDayRange('2027-09-06', '2027-09-12')).toBe('6–12 set 2027')
    expect(formatDayRange('2027-06-30', '2027-07-05')).toBe('30 giu\u2009–\u20095 lug 2027')
    expect(formatDayRange('2027-08-01', '2027-08-20', 'long')).toBe('1–20 agosto 2027')
    expect(formatDayRange('2027-12-28', '2028-01-03')).toBe('28 dic 2027\u2009–\u20093 gen 2028')
  })
})
