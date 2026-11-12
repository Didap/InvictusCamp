import { describe, expect, it } from 'vitest'
import { distributeFamilies, memberLabel, tallyGroups, tallyLabel } from '../../shared/utils/activity-groups'
import type { ProgrammeGroup } from '../../shared/utils/constants'

const family = (id: string, people: number, group: ProgrammeGroup | null = null) => ({
  id,
  familyName: `Famiglia ${id}`,
  group,
  members: Array.from({ length: people }),
})

describe('tallyGroups', () => {
  it('counts families and people of each group, leaving out the families without one', () => {
    const tally = tallyGroups([
      family('a', 4, 'yellow'),
      family('b', 3, 'yellow'),
      family('c', 5),
      family('d', 2, 'blue'),
    ])
    expect(tally).toEqual({
      yellow: { families: 2, people: 7 },
      red: { families: 0, people: 0 },
      blue: { families: 1, people: 2 },
    })
    expect(tallyLabel(tally.yellow)).toBe('7 persone · 2 famiglie')
    expect(tallyLabel({ families: 1, people: 1 })).toBe('1 persona · 1 famiglia')
  })
})

describe('distributeFamilies', () => {
  it('places the largest families first, each in the group with the fewest people', () => {
    const placed = distributeFamilies([
      family('a', 4),
      family('b', 4),
      family('c', 3),
      family('d', 3),
      family('e', 3),
      family('f', 2),
    ])
    // a→Giallo 4, b→Rosso 4, c→Blu 3, d→Blu 6, e→Giallo 7, f→Rosso 6
    expect(Object.fromEntries(placed)).toEqual({
      a: 'yellow',
      b: 'red',
      c: 'blue',
      d: 'blue',
      e: 'yellow',
      f: 'red',
    })
  })

  it('keeps the families already in a group and fills around them', () => {
    const placed = distributeFamilies([family('a', 6, 'yellow'), family('b', 2), family('c', 3)])
    expect(Object.fromEntries(placed)).toEqual({ c: 'red', b: 'blue' })
  })

  it('evens the families when the people are even, then follows Giallo, Rosso, Blu', () => {
    const placed = distributeFamilies([family('a', 0, 'yellow'), family('b', 0), family('c', 0)])
    expect(Object.fromEntries(placed)).toEqual({ b: 'red', c: 'blue' })
  })

  it('counts a family without cards yet as large as the average family', () => {
    // Average 4: the family without cards goes first, like a family of 4, before the family of 3.
    const placed = distributeFamilies([family('a', 5, 'yellow'), family('b', 3, 'red'), family('c', 0), family('d', 3)])
    expect(Object.fromEntries(placed)).toEqual({ c: 'blue', d: 'red' })
  })

  it('places nobody when every family has a group', () => {
    expect(distributeFamilies([family('a', 3, 'red')]).size).toBe(0)
  })
})

describe('memberLabel', () => {
  it('gives the age of the young and only the name of adults', () => {
    expect(memberLabel({ name: 'Matteo', age: 6 })).toBe('Matteo, 6 anni')
    expect(memberLabel({ name: 'Ada', age: 1 })).toBe('Ada, 1 anno')
    expect(memberLabel({ name: 'Grazia', age: null })).toBe('Grazia')
  })
})
