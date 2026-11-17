import { describe, expect, it } from 'vitest'
import { DEFAULT_FAMILY_FORM, formQuestions } from '../../shared/content/family-form'
import {
  accommodationNeeds,
  groupByLocation,
  lodgingLine,
  lodgingWarnings,
  sortLodgings,
} from '../../shared/utils/lodgings'

describe('accommodation needs', () => {
  it('keeps the options the families answered with: answers are stored as labels', () => {
    const question = formQuestions(DEFAULT_FAMILY_FORM.sections).find(item => item.id === 'accommodationNeeds')
    expect(question?.options).toEqual(['Cucina', 'Bagno senza barriere architettoniche', 'Microonde'])
  })

  it('reads the answer in the order of the features, ignoring what it does not know', () => {
    expect(accommodationNeeds(['Microonde', 'Altro', 'Cucina'])).toEqual(['kitchen', 'microwave'])
    expect(accommodationNeeds('Cucina')).toEqual([])
    expect(accommodationNeeds(null)).toEqual([])
    expect(accommodationNeeds(undefined)).toEqual([])
  })
})

describe('lodgings', () => {
  it('sorts by location in the order of the list, then by name with numbers in order', () => {
    const sorted = sortLodgings([
      { name: 'Villetta 10', location: 'invictus_camp' as const },
      { name: 'Appartamento 1', location: 'torricella' as const },
      { name: 'villetta 2', location: 'invictus_camp' as const },
      { name: 'Camera 1', location: 'melina' as const },
    ])
    expect(sorted.map(item => item.name)).toEqual(['Camera 1', 'Appartamento 1', 'villetta 2', 'Villetta 10'])
    expect(groupByLocation(sorted).map(group => [group.label, group.items.length])).toEqual([
      ['B&B Melina', 1],
      ['Appartamenti Torricella', 1],
      ['Alloggi Invictus Camp', 2],
    ])
  })

  it('says how a lodging is made: places, kinds of beds there are, accessibility, features', () => {
    const lodging = { beds: 5, singleBeds: 2, doubleBeds: 1, sofaBeds: 1, accessible: true, features: [] }
    expect(lodgingLine(lodging)).toBe(
      '5 posti letto (1 letto matrimoniale, 2 letti singoli, 1 divano letto) · Accessibile',
    )
    expect(lodgingLine({ ...lodging, singleBeds: 0, doubleBeds: 0, sofaBeds: 2, accessible: false })).toBe(
      '5 posti letto (2 divani letto)',
    )
    expect(lodgingLine({ ...lodging, singleBeds: 0, doubleBeds: 0, sofaBeds: 0, features: ['kitchen'] })).toBe(
      '5 posti letto · Accessibile · Cucina',
    )
  })

  it('says what does not fit: more people than beds, the needs the lodging lacks', () => {
    const villetta = { beds: 4, features: ['kitchen' as const] }
    expect(lodgingWarnings({ people: 4, needs: ['kitchen'] }, villetta)).toEqual([])
    expect(lodgingWarnings({ people: 5, needs: ['kitchen', 'accessible_bathroom', 'microwave'] }, villetta)).toEqual([
      '5 persone e 4 posti letto',
      'Manca: Bagno senza barriere, Microonde',
    ])
    expect(lodgingWarnings({ people: 2, needs: [] }, { beds: 1, features: [] })).toEqual(['2 persone e 1 posto letto'])
  })
})
