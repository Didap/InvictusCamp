// The canteen summary of a session (docs/spec.md 3.14): totals, needs with names, the text for the supplier.
import { describe, expect, it } from 'vitest'
import { staffUsefulInfoSchema } from '../../shared/schemas/staff'
import { canteenSummary, canteenText } from '../../shared/utils/canteen'

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

  it('writes the text for the supplier', () => {
    const text = canteenText({
      session: { title: 'Sessione 9', startDate: '2027-06-21', endDate: '2027-06-25' },
      ...canteenSummary(people),
    })
    expect(text).toContain('Totale pasti 4 (4 persone a ogni pasto) di cui:')
    expect(text).toContain('2 senza lattosio (Anna Rossi, Sara Bianchi)')
    expect(text).toContain('Matteo Rossi: Selettività alimentare: Solo cibi frullati')
  })

  it('asks the staff for the consent only when they write something', () => {
    expect(staffUsefulInfoSchema.safeParse({ info: { allergies: ['milk'] }, consent: false }).success).toBe(false)
    expect(staffUsefulInfoSchema.safeParse({ info: { allergies: ['milk'] }, consent: true }).success).toBe(true)
    expect(staffUsefulInfoSchema.safeParse({ info: { allergies: [], diet: '', notes: ' ' } }).success).toBe(true)
  })
})
