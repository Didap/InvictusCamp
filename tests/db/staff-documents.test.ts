// The required documents of the staff against a real database (docs/spec.md 3.4): the CV on the profile and an
// ID among the personal documents; the home asks for what is missing, a new CV takes the place of the old one.
import { randomUUID } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { myStaffDocuments, replaceStaffCv, staffHome } from '../../server/domain/staff'
import { makeStaff, t, useTestDb } from './helpers'

const db = useTestDb()

const pdf = async (purpose: 'cv' | 'personal_document') =>
  (
    await db
      .insert(t.files)
      .values({
        storageKey: `test/${randomUUID()}.pdf`,
        originalName: 'documento.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 1024,
        sha256: '0'.repeat(64),
        purpose,
      })
      .returning()
  )[0]!
const profileOf = async (userId: string) =>
  (await db.select().from(t.staffProfiles).where(eq(t.staffProfiles.userId, userId)))[0]!

describe('staff required documents', () => {
  it('asks for the CV and the ID until both are there, and a new CV replaces the old one', async () => {
    const { user, profile } = await makeStaff(db)
    const actor = { userId: user.id, ip: null }
    expect((await staffHome(db, profile)).documentsMissing).toEqual(['cv', 'id_document'])

    const first = await pdf('cv')
    expect(await replaceStaffCv(db, { userId: user.id, fileId: first.id, actor })).toBeNull()
    expect((await staffHome(db, await profileOf(user.id))).documentsMissing).toEqual(['id_document'])

    const id = await pdf('personal_document')
    await db.insert(t.personalDocuments).values({
      userId: user.id,
      category: 'id_document',
      title: 'Documento d’identità',
      fileId: id.id,
      uploadedBy: user.id,
    })
    expect((await staffHome(db, await profileOf(user.id))).documentsMissing).toEqual([])

    const second = await pdf('cv')
    expect(await replaceStaffCv(db, { userId: user.id, fileId: second.id, actor })).toBe(first.id)
    const mine = await myStaffDocuments(db, await profileOf(user.id))
    expect(mine.cv?.id).toBe(second.id)
    expect(mine.documents.map(d => d.category)).toEqual(['id_document'])
  })

  it('asks for nothing before the approval', async () => {
    const { profile } = await makeStaff(db, 'applied')
    expect((await staffHome(db, profile)).documentsMissing).toEqual([])
  })
})
