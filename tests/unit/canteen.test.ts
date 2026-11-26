// The canteen summary of a session (docs/spec.md 3.14): totals, needs with names, the text for the supplier.
import { describe, expect, it } from 'vitest'
import { needsHealthConsent } from '../../shared/schemas/staff'
import { canteenSummary, canteenText, canteenWho } from '../../shared/utils/canteen'

describe('canteen', () => {
  const people = [
    { name: 'Sara Bianchi', info: { allergies: ['milk', 'gluten'] }, foodSelectivity: null },
    {
      name: 'Anna Rossi',
      info: { allergies: ['milk'], diet: 'vegetarian', notes: 'Porta il suo pane' },
      foodSelectivity: null,
    },
    { name: 'Matteo Rossi', info: null, foodSelectivity: 'Solo cibi frullati' },
    { name: 'Luca Verdi', info: null, foodSelectivity: null },
  ]

  it('counts everyone and lists each need with its people, in the order of the lists', () => {
    const summary = canteenSummary(people)
    expect(summary.total).toBe(4)
    expect(summary.needs).toEqual([
      { label: 'senza glutine', people: ['Sara Bianchi'] },
      { label: 'senza lattosio', people: ['Anna Rossi', 'Sara Bianchi'] },
      { label: 'vegetariana', people: ['Anna Rossi'] },
    ])
    expect(summary.notes).toEqual([
      { name: 'Anna Rossi', text: 'Porta il suo pane' },
      { name: 'Matteo Rossi', text: 'Selettività alimentare: Solo cibi frullati' },
    ])
  })

  it('says who eats, by group', () => {
    const groups = { families: 12, familyPeople: 60, staff: 10, volunteers: 2, withoutCards: [] }
    expect(canteenWho(groups)).toBe('60 di 12 famiglie, 10 dello staff e 2 del v-team')
    expect(canteenWho({ ...groups, families: 0, familyPeople: 0, volunteers: 0 })).toBe('10 dello staff')
    expect(canteenWho({ ...groups, families: 0, staff: 0, volunteers: 0, withoutCards: ['Famiglia Neri'] })).toBe(
      'nessuno',
    )
  })

  it('writes the text for the supplier', () => {
    const text = canteenText({
      session: { title: 'Sessione 9', startDate: '2027-06-21', endDate: '2027-06-25' },
      ...canteenSummary(people),
      families: 1,
      familyPeople: 3,
      staff: 0,
      volunteers: 1,
      withoutCards: ['Famiglia Neri', 'Famiglia Gialli'],
    })
    expect(text).toContain('Totale pasti 4 (persone a ogni pasto: 3 di 1 famiglia e 1 del v-team) di cui:')
    // How many families are still missing, not who.
    expect(text).toContain('2 famiglie non hanno ancora indicato i componenti e non sono nel totale.')
    expect(text).not.toContain('Neri')
    expect(text).toContain('2 senza lattosio (Anna Rossi, Sara Bianchi)')
    expect(text).toContain('Matteo Rossi: Selettività alimentare: Solo cibi frullati')
  })

  it('asks the staff for the consent only when they write something', () => {
    expect(needsHealthConsent({ info: { allergies: ['milk'] } }, { info: null })).toBe(true)
    expect(needsHealthConsent({ info: { allergies: [], diet: '', notes: ' ' } }, { info: null })).toBe(false)
  })
})
