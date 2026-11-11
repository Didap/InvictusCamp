import { describe, expect, it } from 'vitest'
import { registerFamilySchema } from '#shared/schemas/auth'
import { DISABILITY_FIELDS, memberSchema } from '#shared/schemas/families'

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
  const young = { ...adult, firstName: 'Luca', relationship: 'child', kind: 'young', birthDate: '' }
  const details = Object.fromEntries(DISABILITY_FIELDS.map(field => [field.key, 'niente']))

  it('needs the birth date of an adult, not of a young person', () => {
    expect(memberSchema.safeParse(adult).success).toBe(true)
    expect(refused(memberSchema.safeParse({ ...adult, birthDate: '' }))).toEqual(['birthDate'])
    expect(memberSchema.safeParse(young).success).toBe(true)
  })

  it('shows the missing birth date with the other missing fields', () => {
    expect(refused(memberSchema.safeParse({ ...adult, birthDate: null, relationship: undefined }))).toEqual([
      'relationship',
      'birthDate',
    ])
  })

  it('needs every health detail of a person with a condition, none without', () => {
    expect(memberSchema.safeParse({ ...young, health: { hasDisability: false, disability: null } }).success).toBe(true)
    expect(memberSchema.safeParse({ ...young, health: { hasDisability: true, disability: details } }).success).toBe(
      true,
    )
    const partial = { ...details, mobility: ' ', medicalNotes: undefined }
    expect(refused(memberSchema.safeParse({ ...young, health: { hasDisability: true, disability: partial } }))).toEqual(
      ['health.disability.mobility', 'health.disability.medicalNotes'],
    )
    expect(
      refused(memberSchema.safeParse({ ...young, health: { hasDisability: true, disability: null } })),
    ).toHaveLength(DISABILITY_FIELDS.length)
  })
})
