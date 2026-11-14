// The release of a family (docs/spec.md 3.8): prepared when every card is complete, made again when the data
// changes, the old one archived with its signature cancelled.
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { familyRelease } from '../../server/domain/releases'
import { makeFamily, t, useTestDb } from './helpers'

const db = useTestDb()
const uploadsDir = mkdtempSync(join(tmpdir(), 'invictus-release-'))
const ctx = { appUrl: 'http://localhost:3080' }

describe('release', () => {
  it('is prepared once the cards are complete, and made again when the data changes', async () => {
    const { user, family } = await makeFamily(db, {
      name: 'Famiglia Rossi',
      formStatus: 'submitted',
      formAnswers: { photoConsent: true, publicationConsent: false },
    })
    const actor = { userId: user.id, ip: null }
    const input = { familyId: family.id, ctx, uploadsDir, actor }
    const [anna] = await db
      .insert(t.familyMembers)
      .values({ familyId: family.id, firstName: 'Anna', lastName: 'Rossi', relationship: 'parent', isReferent: true })
      .returning()
    // An adult without the birth date: not complete yet.
    expect(await familyRelease(db, input)).toEqual([])

    await db.update(t.familyMembers).set({ birthDate: '1985-04-12' }).where(eq(t.familyMembers.id, anna!.id))
    const [email] = await familyRelease(db, input)
    expect(email).toMatchObject({ template: 'signature.request', to: user.email })
    const [first] = await db.select().from(t.families).where(eq(t.families.id, family.id))
    const [document] = await db.select().from(t.documents).where(eq(t.documents.id, first!.releaseDocumentId!))
    expect(document).toMatchObject({ title: 'Liberatoria · Famiglia Rossi', category: 'consent', archivedAt: null })

    // Nothing changed: nothing new.
    expect(await familyRelease(db, input)).toEqual([])

    // An answer changes: a new release, the old one archived and its signature cancelled.
    await db
      .update(t.families)
      .set({ formAnswers: { photoConsent: true, publicationConsent: true } })
      .where(eq(t.families.id, family.id))
    expect(await familyRelease(db, input)).toHaveLength(1)
    const [old] = await db.select().from(t.documents).where(eq(t.documents.id, document!.id))
    expect(old!.archivedAt).not.toBeNull()
    const [request] = await db
      .select()
      .from(t.signatureRequests)
      .where(eq(t.signatureRequests.documentId, document!.id))
    expect(request!.status).toBe('cancelled')
  })
})
