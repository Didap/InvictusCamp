// The personal sheet of the staff (/staff/scheda): the codice fiscale, the schema shared with the form, when the
// sheet counts as complete, and the health data under the consent.
import { describe, expect, it } from 'vitest'
import { isFiscalCode, zFiscalCode } from '#shared/schemas/common'
import { hasStaffHealth, isSheetComplete, staffSheetSchema, staffUsefulInfoSchema } from '#shared/schemas/staff'
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
    expect(staffSheetSchema.parse(SHEET)).toMatchObject({ province: 'TA', fiscalCode: 'RSSMRA85T10A562S' })
    expect(staffSheetSchema.safeParse({ ...SHEET, province: '' }).success).toBe(true)
    const missing = staffSheetSchema.safeParse({ ...SHEET, birthPlace: ' ', postalCode: '', shirtSize: undefined })
    expect(missing.error?.issues.map(issue => issue.path[0]).sort()).toEqual(['birthPlace', 'postalCode', 'shirtSize'])
    expect(staffSheetSchema.safeParse({ ...SHEET, shirtSize: 'XXXXL' }).success).toBe(false)
  })

  it('is complete with every required field as stored', () => {
    const stored = { ...SHEET, region: 'Puglia' as const, shirtSize: 'L' as const, province: null }
    expect(isSheetComplete(stored)).toBe(true)
    expect(isSheetComplete({ ...stored, fiscalCode: null })).toBe(false)
    expect(formatTown(stored)).toBe('74020 Maruggio')
    expect(formatTown({ ...stored, province: 'TA' })).toBe('74020 Maruggio (TA)')
  })

  it('keeps the other details as health data: they need the consent too', () => {
    expect(hasStaffHealth({ info: {}, otherInfo: '  ' })).toBe(false)
    expect(hasStaffHealth({ info: null, otherInfo: 'Daltonismo' })).toBe(true)
    expect(staffUsefulInfoSchema.safeParse({ info: {}, otherInfo: 'Daltonismo' }).success).toBe(false)
    expect(staffUsefulInfoSchema.safeParse({ info: {}, otherInfo: 'Daltonismo', consent: true }).success).toBe(true)
  })
})
