// The «Risorse utili» of staff and v-team against a real database (docs/spec.md 3.6): a document to accept asks every
// approved person (with an email) and whoever is approved later (without one); one to consult asks nobody.
import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { changeStaffStatus } from '../../server/domain/staff'
import { isStaffResourceFile, myStaffResources, setStaffResource } from '../../server/domain/staff-resources'
import { makeAdmin, makeDocument, makeFamily, makeStaff, t, useTestDb } from './helpers'

const db = useTestDb()
const ctx = { appUrl: 'http://localhost:3080' }

describe('staff resources', () => {
  it('asks the approved staff to accept, and those approved later; to consult asks nobody', async () => {
    const admin = await makeAdmin(db)
    const actor = { userId: admin.id, ip: null }
    const { user: approved } = await makeStaff(db)
    const { user: candidate } = await makeStaff(db, 'applied')
    const rules = await makeDocument(db, { title: 'Regolamento', category: 'regulation', requiresSignature: false })

    expect(await setStaffResource(db, { documentId: rules.id, mode: 'accept', dryRun: true, ctx, actor })).toEqual({
      emails: [],
      asked: 1,
    })
    const { emails, asked } = await setStaffResource(db, { documentId: rules.id, mode: 'accept', ctx, actor })
    expect(asked).toBe(1)
    expect(emails.map(e => e.to)).toEqual([approved.email])
    const [mine] = await myStaffResources(db, approved.id)
    expect(mine).toMatchObject({
      title: 'Regolamento',
      mode: 'accept',
      request: { status: 'pending', requiresSignature: false },
    })
    expect(await isStaffResourceFile(db, approved.id, rules.fileId)).toBe(true)
    // Not in the staff area yet: no request, no file.
    expect(await isStaffResourceFile(db, candidate.id, rules.fileId)).toBe(false)

    // Approved later: asked too, without an email.
    await changeStaffStatus(db, { userId: candidate.id, status: 'approved', actor })
    expect((await myStaffResources(db, candidate.id))[0]!.request).toMatchObject({ status: 'pending' })

    const notes = await makeDocument(db, { title: 'Descrizione animazione', category: 'other' })
    expect((await setStaffResource(db, { documentId: notes.id, mode: 'consult', ctx, actor })).asked).toBe(0)
    expect((await myStaffResources(db, approved.id)).map(r => [r.title, r.mode, r.request])).toEqual([
      ['Descrizione animazione', 'consult', null],
      ['Regolamento', 'accept', expect.objectContaining({ status: 'pending' })],
    ])
    await setStaffResource(db, { documentId: notes.id, mode: null, ctx, actor })
    expect(await myStaffResources(db, approved.id)).toHaveLength(1)
  })

  it('refuses the documents the gestionale prepares for one person', async () => {
    const admin = await makeAdmin(db)
    const { family } = await makeFamily(db)
    const release = await makeDocument(db, { familyId: family.id })
    await expect(
      setStaffResource(db, { documentId: release.id, mode: 'consult', ctx, actor: { userId: admin.id, ip: null } }),
    ).rejects.toMatchObject({ statusCode: 409 })
    expect(await db.$count(t.documents, eq(t.documents.staffResource, 'consult'))).toBe(0)
  })
})
