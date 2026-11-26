// The personal sheet of the staff (/staff/scheda): the codice fiscale, the schema shared with the form, when the
// sheet counts as complete (the contract formula for the staff only), and the health data under the consent.
import { describe, expect, it } from 'vitest'
import { isFiscalCode, zFiscalCode } from '#shared/schemas/common'
import {
  hasStaffHealth,
  isSheetComplete,
  normalizeNonFoodAllergies,
  sheetMissing,
  staffSheetFormSchema,
  staffSheetSchema,
  staffUsefulInfoSchema,
} from '#shared/schemas/staff'
import { formatTown } from '#shared/utils/format'

const SHEET = {
  birthDate: '1985-12-10',
  birthPlace: 'Roma',
  fiscalCode: 'RSSMRA85T10A562S',
  address: 'Via dei Mille 4',
  city: 'Maruggio',
  postalCode: '74020',
  province: 'ta',
  region: 'Puglia',
  shirtSize: 'L',
  contractType: 'occasional',
}

describe('codice fiscale', () => {
  it('checks the last letter against the other fifteen, omocodia included', () => {
    expect(isFiscalCode('RSSMRA85T10A562S')).toBe(true)
    expect(isFiscalCode('RSSMRA85T10A56NH')).toBe(true)
    expect(isFiscalCode('RSSMRA85T10A562T')).toBe(false)
    expect(isFiscalCode('RSSMRA85Z10A562S')).toBe(false)
    expect(isFiscalCode('RSSMRA85T10A562')).toBe(false)
  })

  it('takes it typed with spaces and in lower case, and says what is wrong', () => {
    expect(zFiscalCode.parse(' rssmra 85t10 a562s ')).toBe('RSSMRA85T10A562S')
    expect(zFiscalCode.safeParse('').error?.issues[0]?.message).toBe('Campo obbligatorio')
    expect(zFiscalCode.safeParse('RSSMRA85T10A562T').error?.issues[0]?.message).toMatch(/non valido/)
  })
})

describe('staff personal sheet', () => {
  it('needs every field but the province', () => {
    const schema = staffSheetSchema('staff')
    expect(schema.parse(SHEET)).toMatchObject({ province: 'TA', fiscalCode: 'RSSMRA85T10A562S' })
    expect(schema.safeParse({ ...SHEET, province: '' }).success).toBe(true)
    const missing = schema.safeParse({ ...SHEET, birthPlace: ' ', postalCode: '', shirtSize: undefined })
    expect(missing.error?.issues.map(issue => issue.path[0]).sort()).toEqual(['birthPlace', 'postalCode', 'shirtSize'])
    expect(schema.safeParse({ ...SHEET, shirtSize: 'XXXXL' }).success).toBe(false)
  })

  it('asks the contract formula of the staff, never of the v-team', () => {
    const none = { ...SHEET, contractType: null }
    expect(
      staffSheetSchema('staff')
        .safeParse(none)
        .error?.issues.map(issue => issue.path[0]),
    ).toEqual(['contractType'])
    expect(staffSheetSchema('volunteer').safeParse(none).success).toBe(true)
    expect(staffSheetSchema('staff').safeParse({ ...SHEET, contractType: 'employee' }).success).toBe(false)
    expect(sheetMissing('staff')).toMatch(/formula contrattuale\.$/)
    expect(sheetMissing('volunteer')).not.toMatch(/formula/)
  })

  it('is complete with every required field as stored', () => {
    const stored = {
      ...SHEET,
      region: 'Puglia' as const,
      shirtSize: 'L' as const,
      contractType: 'occasional' as const,
      province: null,
    }
    expect(isSheetComplete(stored, 'staff')).toBe(true)
    expect(isSheetComplete({ ...stored, fiscalCode: null }, 'staff')).toBe(false)
    expect(isSheetComplete({ ...stored, contractType: null }, 'staff')).toBe(false)
    expect(isSheetComplete({ ...stored, contractType: null }, 'volunteer')).toBe(true)
    expect(formatTown(stored)).toBe('74020 Maruggio')
    expect(formatTown({ ...stored, province: 'TA' })).toBe('74020 Maruggio (TA)')
  })

  it('keeps the other details as health data: they need the consent too', () => {
    expect(hasStaffHealth({ info: {}, otherInfo: '  ' })).toBe(false)
    expect(hasStaffHealth({ info: null, otherInfo: 'Daltonismo' })).toBe(true)
    expect(staffUsefulInfoSchema.safeParse({ info: {}, otherInfo: 'Daltonismo' }).success).toBe(false)
    expect(staffUsefulInfoSchema.safeParse({ info: {}, otherInfo: 'Daltonismo', consent: true }).success).toBe(true)
  })

  it('keeps the allergies not to food as health data, in the order of the list', () => {
    const nonFood = { allergies: ['nickel', 'dust_mites'], other: ' Penicillina ' }
    expect(normalizeNonFoodAllergies(nonFood)).toEqual({ allergies: ['dust_mites', 'nickel'], other: 'Penicillina' })
    expect(normalizeNonFoodAllergies({ allergies: [], other: ' ' })).toBeNull()
    expect(hasStaffHealth({ info: {}, nonFoodAllergies: { other: 'Penicillina' } })).toBe(true)
    expect(staffUsefulInfoSchema.safeParse({ info: {}, nonFoodAllergies: nonFood }).success).toBe(false)
    expect(staffUsefulInfoSchema.safeParse({ info: {}, nonFoodAllergies: { allergies: ['fur'] } }).success).toBe(false)
  })

  it('takes the sheet and the health data in one body, the consent checked under `health`', () => {
    const body = { ...SHEET, health: { info: { allergies: ['gluten'] }, consent: false } }
    const parsed = staffSheetFormSchema('staff').safeParse(body)
    expect(parsed.error?.issues.map(issue => issue.path.join('.'))).toEqual(['health.consent'])
    const ok = staffSheetFormSchema('volunteer').parse({ ...body, contractType: null, health: { info: {} } })
    expect(ok.health).toMatchObject({ info: {}, consent: false })
  })
})
