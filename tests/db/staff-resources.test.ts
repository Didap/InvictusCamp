// The «Risorse utili» of staff and v-team against a real database (docs/spec.md 3.6): a document to accept asks every
// approved person as «Assegna → tutto lo staff»; anyone without a request gets it when they open the resource; one to
// consult asks nobody; leaving «accept» cancels the requests still to answer.
import { and, eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { setDocumentArchived } from '../../server/domain/signatures'
import { changeStaffStatus } from '../../server/domain/staff'
import {
  isStaffResourceFile,
  myStaffResources,
  openStaffResource,
  setStaffResource,
} from '../../server/domain/staff-resources'
import { makeAdmin, makeDocument, makeFamily, makeStaff, t, useTestDb } from './helpers'

const db = useTestDb()
const ctx = { appUrl: 'http://localhost:3080' }
const statusOf = async (documentId: string, userId: string) =>
  (
    await db
      .select({ status: t.signatureRequests.status })
      .from(t.signatureRequests)
      .where(and(eq(t.signatureRequests.documentId, documentId), eq(t.signatureRequests.userId, userId)))
  )[0]?.status

describe('staff resources', () => {
  it('asks the approved staff to accept; whoever comes later is asked when opening it', async () => {
    const admin = await makeAdmin(db)
    const actor = { userId: admin.id, ip: null }
    const { user: approved } = await makeStaff(db)
    const { user: later } = await makeStaff(db, 'applied')
    const rules = await makeDocument(db, { title: 'Regolamento', category: 'regulation', requiresSignature: false })

    const preview = await setStaffResource(db, { documentId: rules.id, mode: 'accept', dryRun: true, ctx, actor })
    expect(preview.result).toMatchObject({ recipients: 1, created: 1, dryRun: true })
    const { messages } = await setStaffResource(db, { documentId: rules.id, mode: 'accept', ctx, actor })
    expect(messages.map(m => m.to)).toEqual([approved.email])
    const [mine] = await myStaffResources(db, approved.id)
    expect(mine).toMatchObject({ mode: 'accept', requiresSignature: false, request: { status: 'pending' } })
    expect(await isStaffResourceFile(db, approved.id, rules.fileId)).toBe(true)
    expect(await isStaffResourceFile(db, later.id, rules.fileId)).toBe(false)

    // Approved later: no request until they open it, then one (no email from here).
    await changeStaffStatus(db, { userId: later.id, status: 'approved', actor })
    expect((await myStaffResources(db, later.id))[0]!.request).toBeNull()
    const requestId = await openStaffResource(db, { userId: later.id, documentId: rules.id })
    expect((await myStaffResources(db, later.id))[0]!.request).toMatchObject({ id: requestId, status: 'pending' })

    // Archived and restored: the requests were cancelled, opening it asks again.
    await setDocumentArchived(db, { documentId: rules.id, archived: true, actor })
    await setDocumentArchived(db, { documentId: rules.id, archived: false, actor })
    expect((await myStaffResources(db, approved.id))[0]!.request).toBeNull()
    await openStaffResource(db, { userId: approved.id, documentId: rules.id })
    expect(await statusOf(rules.id, approved.id)).toBe('pending')

    // Only to consult now: the requests still to answer are cancelled, nothing to confirm.
    await setStaffResource(db, { documentId: rules.id, mode: 'consult', ctx, actor })
    expect(await statusOf(rules.id, approved.id)).toBe('cancelled')
    expect((await myStaffResources(db, approved.id))[0]).toMatchObject({ mode: 'consult', request: null })
    await expect(openStaffResource(db, { userId: approved.id, documentId: rules.id })).rejects.toMatchObject({
      statusCode: 404,
    })
    // The same mode again writes nothing.
    await setStaffResource(db, { documentId: rules.id, mode: 'consult', ctx, actor })
    expect(await db.$count(t.auditLog, eq(t.auditLog.action, 'document.staff_resource'))).toBe(2)
  })

  it('refuses the documents the gestionale prepares for one person', async () => {
    const admin = await makeAdmin(db)
    const { family } = await makeFamily(db)
    const release = await makeDocument(db, { familyId: family.id })
    await expect(
      setStaffResource(db, { documentId: release.id, mode: 'consult', ctx, actor: { userId: admin.id, ip: null } }),
    ).rejects.toMatchObject({ statusCode: 409 })
  })
})
