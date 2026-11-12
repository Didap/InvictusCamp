import { describe, expect, it } from 'vitest'
import { ACCOMMODATION_NEED_FEATURES, FAMILY_FORM_QUESTIONS } from '../../shared/content/family-form'
import { LODGING_FEATURES } from '../../shared/utils/constants'
import { accommodationNeeds, lodgingWarnings, sortLodgings } from '../../shared/utils/lodgings'

describe('accommodation needs', () => {
  it('maps every option of the question to a lodging feature, and every feature has an option', () => {
    const options = FAMILY_FORM_QUESTIONS.find(question => question.id === 'accommodationNeeds')?.options ?? []
    expect(Object.keys(ACCOMMODATION_NEED_FEATURES).sort()).toEqual([...options].sort())
    expect(new Set(Object.values(ACCOMMODATION_NEED_FEATURES))).toEqual(new Set(LODGING_FEATURES))
  })

  it('reads the answers in the order of the features, ignoring what it does not know', () => {
    expect(accommodationNeeds({ accommodationNeeds: ['Microonde', 'Altro', 'Cucina'] })).toEqual([
      'kitchen',
      'microwave',
    ])
    expect(accommodationNeeds({ accommodationNeeds: 'Cucina' })).toEqual([])
    expect(accommodationNeeds(null)).toEqual([])
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
