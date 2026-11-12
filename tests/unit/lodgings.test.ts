import { describe, expect, it } from 'vitest'
import { FAMILY_FORM_QUESTIONS } from '../../shared/content/family-form'
import { accommodationNeeds, groupByArea, lodgingWarnings, sortLodgings } from '../../shared/utils/lodgings'

describe('accommodation needs', () => {
  it('keeps the options the families answered with: answers are stored as labels', () => {
    const question = FAMILY_FORM_QUESTIONS.find(item => item.id === 'accommodationNeeds')
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
  it('sorts by area, then by name with numbers in order, those without an area last', () => {
    const sorted = sortLodgings([
      { name: 'Villetta 10', area: 'Villette' },
      { name: 'Tenda', area: null },
      { name: 'villetta 2', area: 'Villette' },
      { name: 'Camera 1', area: 'Residence' },
    ])
    expect(sorted.map(item => item.name)).toEqual(['Camera 1', 'villetta 2', 'Villetta 10', 'Tenda'])
  })

  it('keeps areas that differ only by case apart, each under one heading', () => {
    const groups = groupByArea(
      sortLodgings([
        { name: 'Villetta 1', area: 'Villette' },
        { name: 'Villetta 2', area: 'villette' },
        { name: 'Villetta 3', area: 'Villette' },
        { name: 'Tenda', area: null },
      ]),
    )
    expect(groups.map(group => [group.area, group.items.length])).toEqual([
      ['villette', 1],
      ['Villette', 2],
      ['Altri alloggi', 1],
    ])
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
