import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { and, eq } from 'drizzle-orm'
import { PDFDocument, StandardFonts } from 'pdf-lib'
import { afterAll, describe, expect, it } from 'vitest'
import { sha256 } from '../../server/domain/crypto'
import {
  CODE_MAX_ATTEMPTS,
  assignDocument,
  cancelRequest,
  confirmReading,
  ensureSignedCopy,
  issueSignatureCode,
  remindRequests,
  resolveAssignees,
  setDocumentArchived,
  signRequest,
  signaturePage,
} from '../../server/domain/signatures'
import { readStoredFile, storeFile } from '../../server/domain/storage'
import { makeAdmin, makeFamily, makeSession, makeStaff, makeUser, t, useTestDb } from './helpers'

const db = useTestDb()
const uploads = mkdtempSync(join(tmpdir(), 'invictus-a4-'))
afterAll(() => rmSync(uploads, { recursive: true, force: true }))
const ctx = { appUrl: 'https://gestionale.test' }
const MINUTE = 60_000

async function onePagePdf(text: string): Promise<Uint8Array> {
  const pdf = await PDFDocument.create()
  const page = pdf.addPage([595.28, 841.89])
  page.drawText(text, { x: 56, y: 760, size: 14, font: await pdf.embedFont(StandardFonts.Helvetica) })
  return pdf.save()
}

/** A document with a real PDF on disk (signing reads it and appends the certificate). */
async function makePdfDocument(values: Partial<typeof t.documents.$inferInsert> = {}) {
  const data = await onePagePdf('Regolamento di prova')
  const file = await storeFile(db, uploads, {
    data,
    originalName: 'regolamento.pdf',
    mimeType: 'application/pdf',
    purpose: 'document',
  })
  const [document] = await db
    .insert(t.documents)
    .values({ title: 'Regolamento di prova', category: 'regulation', fileId: file.id, ...values })
    .returning()
  return { document: document!, data }
}

/** A family account with a pending request for a new document. */
async function pendingRequest(values: Partial<typeof t.documents.$inferInsert> = {}) {
  const admin = await makeAdmin(db)
  const { user } = await makeFamily(db)
  const { document, data } = await makePdfDocument(values)
  const { result } = await assignDocument(db, ctx, {
    documentId: document.id,
    target: { type: 'users', userIds: [user.id] },
    actor: { userId: admin.id },
  })
  expect(result.created).toBe(1)
  const [request] = await db.select().from(t.signatureRequests).where(eq(t.signatureRequests.userId, user.id))
  return { admin, user, document, data, request: request! }
}

function sign(requestId: string, userId: string, code: string, now?: Date) {
  return signRequest(db, ctx, uploads, {
    requestId,
    userId,
    code,
    name: 'Anna Rossi',
    ip: '203.0.113.7',
    userAgent: 'Vitest',
    now,
  })
}

describe('assigning a document', () => {
  it('resolves every target to active accounts', async () => {
    const session = await makeSession(db)
    const invited = await makeFamily(db)
    const confirmed = await makeFamily(db)
    const selected = await makeFamily(db)
    const reserve = await makeFamily(db)
    const disabled = await makeFamily(db)
    await db.update(t.users).set({ status: 'disabled' }).where(eq(t.users.id, disabled.user.id))
    await db.insert(t.sessionFamilies).values([
      { sessionId: session.id, familyId: invited.family.id, kind: 'slot', status: 'invited' },
      { sessionId: session.id, familyId: confirmed.family.id, kind: 'slot', status: 'confirmed' },
      { sessionId: session.id, familyId: selected.family.id, kind: 'slot', status: 'selected' },
      { sessionId: session.id, familyId: reserve.family.id, kind: 'reserve', reserveRank: 1, status: 'invited' },
      { sessionId: session.id, familyId: disabled.family.id, kind: 'slot', status: 'confirmed' },
    ])
    const approved = await makeStaff(db, 'approved')
    const applied = await makeStaff(db, 'applied')
    const declined = await makeStaff(db, 'approved')
    await db.insert(t.sessionStaff).values([
      { sessionId: session.id, userId: approved.user.id, status: 'accepted' },
      { sessionId: session.id, userId: declined.user.id, status: 'declined' },
    ])
    const admin = await makeAdmin(db)

    const sorted = (ids: string[]) => [...ids].sort()
    expect(sorted(await resolveAssignees(db, { type: 'session_families', sessionId: session.id }))).toEqual(
      sorted([invited.user.id, confirmed.user.id]),
    )
    expect(await resolveAssignees(db, { type: 'session_staff', sessionId: session.id })).toEqual([approved.user.id])
    expect(await resolveAssignees(db, { type: 'all_families' })).toHaveLength(4)
    expect(sorted(await resolveAssignees(db, { type: 'all_staff' }))).toEqual(
      sorted([approved.user.id, declined.user.id]),
    )
    expect(
      sorted(
        await resolveAssignees(db, {
          type: 'users',
          userIds: [applied.user.id, admin.id, disabled.user.id, applied.user.id],
        }),
      ),
    ).toEqual([applied.user.id])
  })

  it('counts first, sends one email per new request and is idempotent', async () => {
    const admin = await makeAdmin(db)
    const anna = await makeFamily(db)
    const luca = await makeFamily(db)
    const { document } = await makePdfDocument()
    const input = { documentId: document.id, target: { type: 'all_families' as const }, actor: { userId: admin.id } }

    const dry = await assignDocument(db, ctx, { ...input, dryRun: true })
    expect(dry).toEqual({ result: { recipients: 2, alreadyAssigned: 0, created: 2, dryRun: true }, messages: [] })
    expect(await db.select().from(t.signatureRequests)).toHaveLength(0)

    const first = await assignDocument(db, ctx, { ...input, dueDate: '2099-05-31' })
    expect(first.result.created).toBe(2)
    expect(first.messages.map(m => m.template)).toEqual(['signature.request', 'signature.request'])
    expect(first.messages.map(m => m.to).sort()).toEqual([anna.user.email, luca.user.email].sort())

    const again = await assignDocument(db, ctx, input)
    expect(again.result).toMatchObject({ recipients: 2, alreadyAssigned: 2, created: 0 })
    expect(again.messages).toHaveLength(0)

    await expect(assignDocument(db, ctx, { ...input, dueDate: '2020-01-01' })).rejects.toMatchObject({
      statusCode: 400,
    })
  })

  it('refuses archived documents; archiving cancels what is still to sign', async () => {
    const { admin, document, request } = await pendingRequest()
    const { cancelled } = await setDocumentArchived(db, {
      documentId: document.id,
      archived: true,
      actor: { userId: admin.id },
    })
    expect(cancelled).toBe(1)
    const [row] = await db.select().from(t.signatureRequests).where(eq(t.signatureRequests.id, request.id))
    expect(row!.status).toBe('cancelled')
    await expect(
      assignDocument(db, ctx, {
        documentId: document.id,
        target: { type: 'all_families' },
        actor: { userId: admin.id },
      }),
    ).rejects.toMatchObject({ statusCode: 409 })
  })

  it('reminds only who still has to sign', async () => {
    const { admin, document, user } = await pendingRequest()
    const other = await makeFamily(db)
    await assignDocument(db, ctx, {
      documentId: document.id,
      target: { type: 'users', userIds: [other.user.id] },
      actor: { userId: admin.id },
    })
    await db.update(t.signatureRequests).set({ status: 'signed' }).where(eq(t.signatureRequests.userId, other.user.id))
    const messages = await remindRequests(db, ctx, { documentId: document.id, actor: { userId: admin.id } })
    expect(messages.map(m => [m.to, m.template])).toEqual([[user.email, 'signature.reminder']])
    const [row] = await db.select().from(t.signatureRequests).where(eq(t.signatureRequests.userId, user.id))
    expect(row!.remindedAt).not.toBeNull()
  })
})

describe('the signature code', () => {
  it('is sent by email, stored only as a hash, and a new one waits 60 seconds', async () => {
    const { user, request } = await pendingRequest()
    const t0 = new Date('2027-01-10T10:00:00Z')
    const first = await issueSignatureCode(db, ctx, { requestId: request.id, userId: user.id, now: t0 })
    expect(first.code).toMatch(/^\d{6}$/)
    expect(first.message).toMatchObject({ template: 'signature.otp', to: user.email, sensitive: true })
    const [row] = await db.select().from(t.signatureRequests).where(eq(t.signatureRequests.id, request.id))
    expect(row!.otpHash).not.toContain(first.code)
    expect(row!.otpExpiresAt!.getTime()).toBe(t0.getTime() + 10 * MINUTE)

    await expect(
      issueSignatureCode(db, ctx, { requestId: request.id, userId: user.id, now: new Date(t0.getTime() + 30_000) }),
    ).rejects.toMatchObject({ statusCode: 429 })
    const second = await issueSignatureCode(db, ctx, {
      requestId: request.id,
      userId: user.id,
      now: new Date(t0.getTime() + 61_000),
    })
    expect(second.state.attemptsLeft).toBe(CODE_MAX_ATTEMPTS)
  })

  it('expires after 10 minutes', async () => {
    const { user, request } = await pendingRequest()
    const t0 = new Date()
    const { code } = await issueSignatureCode(db, ctx, { requestId: request.id, userId: user.id, now: t0 })
    const late = new Date(t0.getTime() + 10 * MINUTE + 1000)
    expect(await sign(request.id, user.id, code, late)).toMatchObject({ ok: false, reason: 'expired' })
  })

  it('allows 5 attempts, then a new code is needed', async () => {
    const { user, request } = await pendingRequest()
    const { code } = await issueSignatureCode(db, ctx, { requestId: request.id, userId: user.id })
    const wrong = code === '000000' ? '111111' : '000000'
    for (let left = CODE_MAX_ATTEMPTS - 1; left >= 1; left--) {
      expect(await sign(request.id, user.id, wrong)).toEqual({ ok: false, reason: 'wrong', attemptsLeft: left })
    }
    expect(await sign(request.id, user.id, wrong)).toEqual({ ok: false, reason: 'locked', attemptsLeft: 0 })
    expect(await sign(request.id, user.id, code)).toMatchObject({ ok: false, reason: 'locked' })

    const later = new Date(Date.now() + 2 * MINUTE)
    const fresh = await issueSignatureCode(db, ctx, { requestId: request.id, userId: user.id, now: later })
    expect(await sign(request.id, user.id, fresh.code, later)).toMatchObject({ ok: true })
  })
})

describe('signing', () => {
  it('stores the hash, the signed copy and the audit, and sends the confirmation', async () => {
    const { user, request, data, document } = await pendingRequest()
    const { code } = await issueSignatureCode(db, ctx, { requestId: request.id, userId: user.id })
    const outcome = await sign(request.id, user.id, ` ${code} `)
    expect(outcome).toMatchObject({ ok: true })
    if (!outcome.ok) return
    expect(outcome.message).toMatchObject({ template: 'signature.signed', to: user.email })

    const [row] = await db.select().from(t.signatureRequests).where(eq(t.signatureRequests.id, request.id))
    expect(row).toMatchObject({
      status: 'signed',
      signedName: 'Anna Rossi',
      signedIp: '203.0.113.7',
      signedUserAgent: 'Vitest',
      documentSha256: sha256(data),
      otpHash: null,
      signedFileId: outcome.signedFileId,
    })
    const [copy] = await db.select().from(t.files).where(eq(t.files.id, outcome.signedFileId))
    expect(copy).toMatchObject({ purpose: 'signed_copy', ownerUserId: user.id, mimeType: 'application/pdf' })
    const pdf = await PDFDocument.load(await readStoredFile(uploads, copy!))
    expect(pdf.getPageCount()).toBe(2)

    const audit = await db
      .select()
      .from(t.auditLog)
      .where(and(eq(t.auditLog.action, 'signature.sign'), eq(t.auditLog.entityId, request.id)))
    expect(audit).toHaveLength(1)
    expect(audit[0]!.data).toMatchObject({ documentId: document.id, sha256: sha256(data) })
    expect(JSON.stringify(audit[0]!.data)).not.toContain(code)
  })

  it('refuses a second signature', async () => {
    const { user, request } = await pendingRequest()
    const { code } = await issueSignatureCode(db, ctx, { requestId: request.id, userId: user.id })
    expect(await sign(request.id, user.id, code)).toMatchObject({ ok: true })
    await expect(sign(request.id, user.id, code)).rejects.toMatchObject({ statusCode: 409 })
    await expect(issueSignatureCode(db, ctx, { requestId: request.id, userId: user.id })).rejects.toMatchObject({
      statusCode: 409,
    })
  })

  it('is only for the assignee', async () => {
    const { user, request } = await pendingRequest()
    const stranger = await makeUser(db, { role: 'staff' })
    await expect(issueSignatureCode(db, ctx, { requestId: request.id, userId: stranger.id })).rejects.toMatchObject({
      statusCode: 404,
    })
    const { code } = await issueSignatureCode(db, ctx, { requestId: request.id, userId: user.id })
    await expect(sign(request.id, stranger.id, code)).rejects.toMatchObject({ statusCode: 404 })
    await expect(signaturePage(db, request.id, stranger.id)).rejects.toMatchObject({ statusCode: 404 })
    expect((await signaturePage(db, request.id, user.id)).code).not.toBeNull()
  })

  it('is refused once the request is cancelled', async () => {
    const { admin, user, request } = await pendingRequest()
    const { code } = await issueSignatureCode(db, ctx, { requestId: request.id, userId: user.id })
    await cancelRequest(db, { requestId: request.id, actor: { userId: admin.id } })
    await expect(sign(request.id, user.id, code)).rejects.toMatchObject({ statusCode: 409 })
    await expect(cancelRequest(db, { requestId: request.id, actor: { userId: admin.id } })).rejects.toMatchObject({
      statusCode: 409,
    })
  })

  it('confirms the reading of a document to read, without a code', async () => {
    const { user, request } = await pendingRequest({ requiresSignature: false })
    await expect(issueSignatureCode(db, ctx, { requestId: request.id, userId: user.id })).rejects.toMatchObject({
      statusCode: 409,
    })
    await confirmReading(db, uploads, { requestId: request.id, userId: user.id, ip: null, userAgent: null })
    const page = await signaturePage(db, request.id, user.id)
    expect(page.status).toBe('signed')
    await expect(ensureSignedCopy(db, uploads, request.id)).rejects.toMatchObject({ statusCode: 404 })
  })

  it('generates the copy of a request signed without one at the first download', async () => {
    const { user, request, data } = await pendingRequest()
    await db
      .update(t.signatureRequests)
      .set({ status: 'signed', signedAt: new Date(), signedName: 'Firma di esempio', documentSha256: sha256(data) })
      .where(eq(t.signatureRequests.id, request.id))
    const first = await ensureSignedCopy(db, uploads, request.id)
    expect(first).toMatchObject({ purpose: 'signed_copy', ownerUserId: user.id })
    expect((await ensureSignedCopy(db, uploads, request.id)).id).toBe(first.id)
    const [row] = await db.select().from(t.signatureRequests).where(eq(t.signatureRequests.id, request.id))
    expect(row!.signedFileId).toBe(first.id)
  })
})
