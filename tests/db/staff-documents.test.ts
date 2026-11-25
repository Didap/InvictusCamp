// The required documents of the staff against a real database (docs/spec.md 3.4): a CV (the application's
// counts) and an ID, in PDF, among the personal documents; the home asks for what is missing.
import { randomUUID } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { myStaffDocuments, staffHome } from '../../server/domain/staff'
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
const addDocument = async (
  userId: string,
  category: 'cv' | 'id_document',
  mimeType: 'application/pdf' | 'image/jpeg',
) => {
  const stored = await file('personal_document', mimeType)
  await db
    .insert(t.personalDocuments)
    .values({ userId, category, title: category, fileId: stored.id, uploadedBy: userId })
}

describe('staff required documents', () => {
  it('asks for a CV and an ID in PDF until both are there; the CV of the application counts', async () => {
    const { user, profile } = await makeStaff(db)
    expect((await staffHome(db, profile)).documentsMissing).toEqual(['cv', 'id_document'])

    // The CV of the application counts, and stays where it is.
    const sent = await file('cv')
    await db.update(t.staffProfiles).set({ cvFileId: sent.id }).where(eq(t.staffProfiles.userId, user.id))
    expect((await staffHome(db, await profileOf(user.id))).documentsMissing).toEqual(['id_document'])

    // An ID photo from before does not count: the required documents are in PDF.
    await addDocument(user.id, 'id_document', 'image/jpeg')
    expect((await staffHome(db, await profileOf(user.id))).documentsMissing).toEqual(['id_document'])
    await addDocument(user.id, 'id_document', 'application/pdf')
    const mine = await myStaffDocuments(db, await profileOf(user.id))
    expect(mine).toMatchObject({ cv: { id: sent.id }, documentsMissing: [] })
  })

  it('takes a CV uploaded from the staff area when there is none from the application', async () => {
    const { user } = await makeStaff(db)
    await addDocument(user.id, 'cv', 'application/pdf')
    await addDocument(user.id, 'id_document', 'application/pdf')
    expect((await staffHome(db, await profileOf(user.id))).documentsMissing).toEqual([])
  })

  it('asks for nothing before the approval', async () => {
    const { profile } = await makeStaff(db, 'applied')
    expect((await staffHome(db, profile)).documentsMissing).toEqual([])
  })
})
