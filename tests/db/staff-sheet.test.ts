// The personal sheet of the staff against a real database (docs/spec.md 3.4): saved and read back, audited by the
// names of the fields that changed, asked for by the home until complete; the other details under the consent.
import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { myStaffSheet, saveStaffSheet, saveStaffUsefulInfo, staffHome } from '../../server/domain/staff'
import { makeStaff, t, useTestDb } from './helpers'

const db = useTestDb()

const VALUE = {
  birthDate: '1985-12-10',
  birthPlace: 'Roma',
  fiscalCode: 'RSSMRA85T10A562S',
  address: 'Via dei Mille 4',
  city: 'Maruggio',
  postalCode: '74020',
  province: '',
  region: 'Puglia' as const,
  shirtSize: 'L' as const,
}

const auditOf = (action: string) =>
  db.select({ data: t.auditLog.data }).from(t.auditLog).where(eq(t.auditLog.action, action))

describe('staff personal sheet', () => {
  it('saves the sheet, audits the fields that changed without their values, and the home stops asking', async () => {
    const { user, profile } = await makeStaff(db)
    const actor = { userId: user.id, ip: null }
    expect((await staffHome(db, profile)).sheetComplete).toBe(false)

    const sheet = await saveStaffSheet(db, { userId: user.id, value: VALUE, actor })
    expect(sheet).toMatchObject({ fiscalCode: 'RSSMRA85T10A562S', province: null, shirtSize: 'L' })
    const [row] = await db.select().from(t.staffProfiles).where(eq(t.staffProfiles.id, profile.id))
    const read = await myStaffSheet(db, user, row!)
    expect(read.account).toEqual({
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      phone: user.phone,
    })
    expect(read.sheet).toEqual(sheet)
    expect(read.health).toEqual({ info: null, otherInfo: null, consentAt: null })
    expect((await staffHome(db, row!)).sheetComplete).toBe(true)

    // Saving the same values writes nothing; a new size is one field in the audit, never its value.
    await saveStaffSheet(db, { userId: user.id, value: VALUE, actor })
    await saveStaffSheet(db, { userId: user.id, value: { ...VALUE, shirtSize: 'XL' }, actor })
    const audits = await auditOf('staff.sheet')
    expect(audits).toHaveLength(2)
    expect(audits.map(audit => audit.data)).toContainEqual({ fields: ['shirtSize'] })
    expect(JSON.stringify(audits)).not.toContain('RSSMRA85T10A562S')
  })

  it('keeps the other details under the consent, out of the canteen details', async () => {
    const { user } = await makeStaff(db)
    const actor = { userId: user.id, ip: null }
    const saved = await saveStaffUsefulInfo(db, {
      userId: user.id,
      value: { info: {}, otherInfo: ' Daltonismo ', consent: true },
      actor,
    })
    expect(saved).toMatchObject({ info: null, otherInfo: 'Daltonismo' })
    expect(saved.consentAt).not.toBeNull()
    expect((await auditOf('staff.useful_info')).at(-1)?.data).toEqual({ fields: ['otherInfo'] })

    // Saving nothing clears both and withdraws the consent.
    expect(
      await saveStaffUsefulInfo(db, { userId: user.id, value: { info: {}, otherInfo: '', consent: false }, actor }),
    ).toEqual({ info: null, otherInfo: null, consentAt: null })
  })
})
