// The required documents of the staff against a real database (docs/spec.md 3.4): the CV on the profile and an
// ID in PDF among the personal documents; the home asks for what is missing; the CV of an application stays.
import { randomUUID } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { addStaffCv, myStaffDocuments, staffHome } from '../../server/domain/staff'
import { makeStaff, t, useTestDb } from './helpers'

const db = useTestDb()

const file = async (
  purpose: 'cv' | 'personal_document',
  mimeType: 'application/pdf' | 'image/jpeg' = 'application/pdf',
) =>
  (
    await db
      .insert(t.files)
      .values({
        storageKey: `test/${randomUUID()}`,
        originalName: mimeType === 'application/pdf' ? 'documento.pdf' : 'foto.jpg',
        mimeType,
        sizeBytes: 1024,
        sha256: '0'.repeat(64),
        purpose,
      })
      .returning()
  )[0]!
const profileOf = async (userId: string) =>
  (await db.select().from(t.staffProfiles).where(eq(t.staffProfiles.userId, userId)))[0]!
const addId = async (userId: string, mimeType: 'application/pdf' | 'image/jpeg') => {
  const id = await file('personal_document', mimeType)
  await db
    .insert(t.personalDocuments)
    .values({ userId, category: 'id_document', title: 'Documento d’identità', fileId: id.id, uploadedBy: userId })
}

describe('staff required documents', () => {
  it('asks for the CV and an ID in PDF until both are there; the CV of the application stays', async () => {
    const { user, profile } = await makeStaff(db)
    const actor = { userId: user.id, ip: null }
    expect((await staffHome(db, profile)).documentsMissing).toEqual(['cv', 'id_document'])

    const first = await file('cv')
    expect(await addStaffCv(db, { userId: user.id, fileId: first.id, actor })).toBe(true)
    // A CV is there: another one does not take its place.
    expect(await addStaffCv(db, { userId: user.id, fileId: (await file('cv')).id, actor })).toBe(false)
    expect((await profileOf(user.id)).cvFileId).toBe(first.id)

    // An ID photo from before does not count: the ID is required in PDF.
    await addId(user.id, 'image/jpeg')
    expect((await staffHome(db, await profileOf(user.id))).documentsMissing).toEqual(['id_document'])
    await addId(user.id, 'application/pdf')
    expect((await staffHome(db, await profileOf(user.id))).documentsMissing).toEqual([])
    const mine = await myStaffDocuments(db, await profileOf(user.id))
    expect(mine).toMatchObject({ cv: { id: first.id }, documentsMissing: [] })
  })

  it('asks for nothing before the approval', async () => {
    const { profile } = await makeStaff(db, 'applied')
    expect((await staffHome(db, profile)).documentsMissing).toEqual([])
  })
})
