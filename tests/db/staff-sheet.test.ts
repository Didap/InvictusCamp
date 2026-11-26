// The personal sheet of the staff against a real database (docs/spec.md 3.4): saved and read back, audited by the
// names of the fields that changed, asked for by the home until complete; the contract formula of the staff only;
// the health data under the consent; once complete, its PDF to sign, made again when the data changes.
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { and, eq, isNull } from 'drizzle-orm'
import { afterAll, describe, expect, it } from 'vitest'
import { assignDocument, documentDetail, setDocumentArchived } from '../../server/domain/signatures'
import {
  myStaffSheet,
  saveStaffSheet,
  saveStaffUsefulInfo,
  setStaffTeam,
  sheetSignature,
  staffHome,
} from '../../server/domain/staff'
import { staffSheetDocument } from '../../server/domain/staff-sheets'
import { makeStaff, t, useTestDb } from './helpers'

const db = useTestDb()
const uploadsDir = mkdtempSync(join(tmpdir(), 'invictus-staff-sheet-'))
const ctx = { appUrl: 'http://localhost:3080' }
afterAll(() => rmSync(uploadsDir, { recursive: true, force: true }))

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
  contractType: 'vat_number' as const,
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
    expect(read.team).toBe('staff')
    expect(read.health).toEqual({ info: null, nonFoodAllergies: null, otherInfo: null, consentAt: null })
    expect((await staffHome(db, row!)).sheetComplete).toBe(true)

    // Saving the same values writes nothing; a new size is one field in the audit, never its value.
    await saveStaffSheet(db, { userId: user.id, value: VALUE, actor })
    await saveStaffSheet(db, { userId: user.id, value: { ...VALUE, shirtSize: 'XL' }, actor })
    const audits = await auditOf('staff.sheet')
    expect(audits).toHaveLength(2)
    expect(audits.map(audit => audit.data)).toContainEqual({ fields: ['shirtSize'] })
    expect(JSON.stringify(audits)).not.toContain('RSSMRA85T10A562S')
  })

  it('leaves the contract formula to the staff: a v-team volunteer has none', async () => {
    const { user, profile } = await makeStaff(db)
    await db.update(t.staffProfiles).set({ team: 'volunteer' }).where(eq(t.staffProfiles.id, profile.id))
    const actor = { userId: user.id, ip: null }
    expect(await saveStaffSheet(db, { userId: user.id, value: VALUE, actor })).toMatchObject({ contractType: null })
    const [row] = await db.select().from(t.staffProfiles).where(eq(t.staffProfiles.id, profile.id))
    expect(row!.contractType).toBeNull()
    expect((await staffHome(db, row!)).sheetComplete).toBe(true)

    // Moved to the staff, the formula is asked; moved back, the one chosen goes.
    await setStaffTeam(db, { userId: user.id, team: 'staff', actor })
    await saveStaffSheet(db, { userId: user.id, value: VALUE, actor })
    await setStaffTeam(db, { userId: user.id, team: 'volunteer', actor })
    const [moved] = await db.select().from(t.staffProfiles).where(eq(t.staffProfiles.id, profile.id))
    expect(moved!.contractType).toBeNull()
  })

  it('keeps the health data under the consent, the consent of when it was given while nothing changes', async () => {
    const { user } = await makeStaff(db)
    const actor = { userId: user.id, ip: null }
    const value = {
      info: { allergies: ['gluten'], notes: ' Fragole ' },
      nonFoodAllergies: { allergies: ['cat_hair'], other: '' },
      otherInfo: ' Daltonismo ',
      consent: true,
    }
    const saved = await saveStaffUsefulInfo(db, { userId: user.id, value, actor })
    expect(saved.consentAt).not.toBeNull()
    expect(saved).toMatchObject({
      info: { allergies: ['gluten'], notes: 'Fragole' },
      nonFoodAllergies: { allergies: ['cat_hair'] },
      otherInfo: 'Daltonismo',
    })
    expect(saved.consentAt).not.toBeNull()
    expect((await auditOf('staff.useful_info')).at(-1)?.data).toEqual({
      fields: ['info.allergies', 'info.notes', 'nonFoodAllergies.allergies', 'otherInfo'],
    })
    expect(JSON.stringify(await auditOf('staff.useful_info'))).not.toContain('Daltonismo')

    // The same data again (as the sheet sends it at every save, the box empty): nothing written, the consent of
    // before.
    const audits = (await auditOf('staff.useful_info')).length
    expect(await saveStaffUsefulInfo(db, { userId: user.id, value: { ...value, consent: false }, actor })).toEqual(
      saved,
    )
    expect(await auditOf('staff.useful_info')).toHaveLength(audits)

    // Changed data needs the consent ticked again.
    await expect(
      saveStaffUsefulInfo(db, {
        userId: user.id,
        value: { ...value, otherInfo: 'Discalculia', consent: false },
        actor,
      }),
    ).rejects.toMatchObject({ statusCode: 400 })

    // Saving nothing clears everything and withdraws the consent.
    expect(await saveStaffUsefulInfo(db, { userId: user.id, value: { info: {}, consent: false }, actor })).toEqual({
      info: null,
      nonFoodAllergies: null,
      otherInfo: null,
      consentAt: null,
    })
    expect((await auditOf('staff.useful_info')).at(-1)?.data).toMatchObject({ withdrawn: true })
  })

  it('prepares the PDF to sign once the sheet is complete, and makes it again when the data changes', async () => {
    const { user } = await makeStaff(db)
    const actor = { userId: user.id, ip: null }
    const input = { userId: user.id, ctx, uploadsDir, actor }
    // Nothing filled in: nothing to sign.
    expect(await staffSheetDocument(db, input)).toEqual([])
    expect(await sheetSignature(db, user.id)).toBeNull()

    await saveStaffSheet(db, { userId: user.id, value: VALUE, actor })
    const [email] = await staffSheetDocument(db, input)
    expect(email).toMatchObject({ template: 'signature.request', to: user.email })
    const [document] = await db.select().from(t.documents).where(eq(t.documents.staffUserId, user.id))
    expect(document).toMatchObject({
      title: `Scheda personale · ${user.firstName} ${user.lastName}`,
      category: 'other',
      familyId: null,
      archivedAt: null,
    })
    const signature = await sheetSignature(db, user.id)
    expect(signature).toMatchObject({ status: 'pending', signedAt: null })
    // The sheet is the person's own: never assigned to anyone else, never restored once replaced.
    await expect(
      assignDocument(db, ctx, { documentId: document!.id, target: { type: 'all_staff' }, actor }),
    ).rejects.toMatchObject({ statusCode: 409 })
    // The administration sees it as the gestionale's, so it offers none of those actions.
    expect(await documentDetail(db, document!.id)).toMatchObject({
      generated: true,
      requests: [{ document: { generated: true } }],
    })

    // Nothing changed: nothing new.
    expect(await staffSheetDocument(db, input)).toEqual([])

    // The phone of the account changes: a new PDF, the old one archived and its signature cancelled.
    await db.update(t.users).set({ phone: '+39 333 000 1111' }).where(eq(t.users.id, user.id))
    expect(await staffSheetDocument(db, input)).toHaveLength(1)
    const [old] = await db.select().from(t.signatureRequests).where(eq(t.signatureRequests.id, signature!.id))
    expect(old!.status).toBe('cancelled')
    await expect(setDocumentArchived(db, { documentId: document!.id, archived: false, actor })).rejects.toMatchObject({
      statusCode: 409,
    })
    const inForce = await db
      .select()
      .from(t.documents)
      .where(and(eq(t.documents.staffUserId, user.id), isNull(t.documents.archivedAt)))
    expect(inForce).toHaveLength(1)
    const [profile] = await db.select().from(t.staffProfiles).where(eq(t.staffProfiles.userId, user.id))
    const { signature: renewed } = await myStaffSheet(db, user, profile!)
    expect(renewed).toMatchObject({ status: 'pending' })
    expect(renewed!.id).not.toBe(signature!.id)
  })

  it('asks no signature before the approval', async () => {
    const { user } = await makeStaff(db, 'applied')
    const actor = { userId: user.id, ip: null }
    await saveStaffSheet(db, { userId: user.id, value: VALUE, actor })
    expect(await staffSheetDocument(db, { userId: user.id, ctx, uploadsDir, actor })).toEqual([])
    expect(await db.$count(t.documents, eq(t.documents.staffUserId, user.id))).toBe(0)
  })
})
