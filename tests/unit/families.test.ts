import { describe, expect, it } from 'vitest'
import { registerFamilySchema } from '#shared/schemas/auth'
import { DISABILITY_CHOICES } from '#shared/content/member-form'
import { memberSchema, normalizeHealth } from '#shared/schemas/families'
import { familyNameOf, isCardToComplete, surnameOf } from '#shared/utils/format'

/** The names of the fields a parse refuses, as the form shows them. */
function refused(result: { success: boolean; error?: { issues: { path: PropertyKey[] }[] } }): string[] {
  return (result.error?.issues ?? []).map(issue => issue.path.join('.'))
}

describe('family registration', () => {
  const valid = {
    familyName: 'Famiglia Rossi',
    firstName: 'Anna',
    lastName: 'Rossi',
    email: 'anna@example.com',
    phone: '+39 333 1234567',
    password: 'una-password-lunga',
    privacy: true,
  }

  it('needs the phone', () => {
    expect(registerFamilySchema.safeParse(valid).success).toBe(true)
    expect(refused(registerFamilySchema.safeParse({ ...valid, phone: '  ' }))).toEqual(['phone'])
    expect(refused(registerFamilySchema.safeParse({ ...valid, phone: undefined }))).toEqual(['phone'])
  })
})

describe('family member', () => {
  const adult = { firstName: 'Anna', lastName: 'Rossi', relationship: 'parent', kind: 'adult', birthDate: '1985-03-02' }
  const young = { ...adult, firstName: 'Luca', relationship: 'sibling', kind: 'young', birthDate: '2015-04-12' }
  const details = Object.fromEntries(DISABILITY_CHOICES.map(field => [field.key, [field.options[0].value]]))

  it('needs the birth date of an adult, not of a young person', () => {
    expect(memberSchema.safeParse(adult).success).toBe(true)
    expect(refused(memberSchema.safeParse({ ...adult, birthDate: '' }))).toEqual(['birthDate'])
    expect(memberSchema.safeParse({ ...young, birthDate: '' }).success).toBe(true)
    // The young person with a condition needs it: the camp takes 5 to 21 year olds.
    const health = { hasDisability: true, disability: details }
    expect(refused(memberSchema.safeParse({ ...young, birthDate: '', health }))).toEqual(['birthDate'])
  })

  it('asks the relationship of everyone but the young person with a condition', () => {
    const health = { hasDisability: true, disability: details }
    expect(memberSchema.safeParse({ ...young, relationship: null, health }).success).toBe(true)
    expect(refused(memberSchema.safeParse({ ...adult, relationship: null }))).toEqual(['relationship'])
    // Without `health` (no consent) the server knows whether the card is the young person's.
    expect(memberSchema.safeParse({ ...young, relationship: null }).success).toBe(true)
  })

  it('counts a card without the relationship it needs as still to complete', () => {
    const card = { firstName: 'Luca', kind: 'young', birthDate: '2015-04-12', relationship: null } as const
    expect(isCardToComplete({ ...card, hasDisability: true })).toBe(false)
    // After the consent is withdrawn the young person is like the others: the relationship is missing.
    expect(isCardToComplete({ ...card, hasDisability: false })).toBe(true)
  })

  it('writes the family as «Famiglia …» once', () => {
    expect(familyNameOf(' Rossi ')).toBe('Famiglia Rossi')
    expect(familyNameOf('Famiglia')).toBe('Famiglia')
    expect(familyNameOf('famiglia Rossi')).toBe('famiglia Rossi')
    expect(surnameOf('Famiglia De Luca')).toBe('De Luca')
  })

  it('refuses what is not a member, without throwing', () => {
    expect(memberSchema.safeParse(null).success).toBe(false)
    expect(memberSchema.safeParse(undefined).success).toBe(false)
  })

  it('shows the missing birth date with the other missing fields', () => {
    expect(refused(memberSchema.safeParse({ ...adult, birthDate: null, relationship: undefined }))).toEqual([
      'birthDate',
      'relationship',
    ])
  })

  it('needs every health detail of a person with a condition, none without', () => {
    expect(memberSchema.safeParse({ ...young, health: { hasDisability: false, disability: null } }).success).toBe(true)
    expect(memberSchema.safeParse({ ...young, health: { hasDisability: true, disability: details } }).success).toBe(
      true,
    )
    const partial = { ...details, mobility: [], care: undefined }
    expect(refused(memberSchema.safeParse({ ...young, health: { hasDisability: true, disability: partial } }))).toEqual(
      ['health.disability.mobility', 'health.disability.care'],
    )
    expect(
      refused(memberSchema.safeParse({ ...young, health: { hasDisability: true, disability: null } })),
    ).toHaveLength(DISABILITY_CHOICES.length)
    const unknown = { ...details, conditions: ['nessuna-di-queste'] }
    expect(refused(memberSchema.safeParse({ ...young, health: { hasDisability: true, disability: unknown } }))).toEqual(
      ['health.disability.conditions.0'],
    )
  })

  it('keeps «none» alone and the condition to young people', () => {
    const withNone = { ...details, care: ['none', 'daily_meds'] }
    expect(
      refused(memberSchema.safeParse({ ...young, health: { hasDisability: true, disability: withNone } })),
    ).toEqual(['health.disability.care'])
    expect(refused(memberSchema.safeParse({ ...adult, health: { hasDisability: true, disability: details } }))).toEqual(
      ['kind'],
    )
  })

  it('stores the choices in the order of the options, and the useful info of anyone', () => {
    const health = normalizeHealth({
      hasDisability: false,
      disability: { conditions: ['autism'] },
      info: { allergies: ['nuts', 'gluten', 'nuts'], diet: '', notes: '  ' },
    })
    expect(health).toEqual({ hasDisability: false, disability: null, info: { allergies: ['gluten', 'nuts'] } })
    expect(normalizeHealth({ hasDisability: true, disability: { care: ['none'] } }).info).toBeNull()
  })
})
