// The documents area (docs/spec.md 3.6): documents of the administration, who they go to, reminders,
// cancellations, the archive, and the signature itself: a simple electronic signature (FES) confirmed
// by a one-time code sent by email. Signing records time, IP, user agent, the typed name and the
// SHA-256 of the original, then stores the signed copy: the original with a certificate page appended.
// A document "to read" (requiresSignature false) is confirmed with a tick, without a code or a copy.
import { and, asc, desc, eq, inArray, isNull, lte, ne, or, sql, type SQL } from 'drizzle-orm'
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib'
import type {
  AssignablePerson,
  AssignResult,
  AssignTarget,
  DocumentDetail,
  DocumentListItem,
  DocumentOptions,
  MySignatureItem,
  SignatureCodeState,
  SignaturePage,
  SignatureRequestRow,
} from '../../shared/types/documents'
import {
  DOCUMENT_AUDIENCES,
  LOCALE,
  TIME_ZONE,
  type DocumentAudience,
  type DocumentCategory,
} from '../../shared/utils/constants'
import { todayIso } from '../../shared/utils/dates'
import { fullName } from '../../shared/utils/format'
import {
  campSessions,
  documents,
  families,
  files,
  sessionFamilies,
  sessionStaff,
  signatureRequests,
  staffProfiles,
  users,
} from '../db/schema'
import { signatureSignedEmail } from '../emails/documents'
import { signatureOtpEmail } from '../emails/signatures'
import type { EmailContext, EmailMessage } from '../emails/types'
import { writeAudit } from './audit'
import { otpCode, safeEqualHex, sha256 } from './crypto'
import type { DbOrTx } from './db'
import { requestSignatures, signatureRequestEmails } from './signature-requests'
import { cleanName, deleteStoredFile, readStoredFile, storeFile, type FileRow } from './storage'
import { DomainError } from './errors'

/** A code is valid 10 minutes, a new one can be asked after 60 seconds, 5 attempts per code. */
export const CODE_TTL_MS = 10 * 60_000
export const CODE_RESEND_MS = 60_000
export const CODE_MAX_ATTEMPTS = 5
export const SIGNATURE_METHOD = 'Firma elettronica semplice con codice OTP inviato via email'

// ─── Errors ─────────────────────────────────────────────────────────────────────────────────────────

function fail(statusCode: number, message: string, data?: Record<string, unknown>): DomainError {
  return new DomainError(statusCode, message, data)
}

interface Actor {
  userId: string
  ip?: string | null
}

// ─── Documents ──────────────────────────────────────────────────────────────────────────────────────

type DocumentRow = typeof documents.$inferSelect

/**
 * Document locks, held until the end of the transaction: what changes the file, whether it is to sign
 * or whether it is archived takes `update`; signing and assigning take `share`. So a replacement waits
 * for the signatures in progress and counts them, and a signature never lands on a file being replaced.
 */
type DocumentLock = 'update' | 'share'

async function requireDocument(db: DbOrTx, documentId: string, lock?: DocumentLock): Promise<DocumentRow> {
  const query = db.select().from(documents).where(eq(documents.id, documentId)).limit(1)
  const [row] = lock ? await query.for(lock) : await query
  if (!row) throw fail(404, 'Documento non trovato')
  return row
}

async function requireSession(db: DbOrTx, sessionId: string): Promise<void> {
  const [row] = await db
    .select({ id: campSessions.id })
    .from(campSessions)
    .where(eq(campSessions.id, sessionId))
    .limit(1)
  if (!row) throw fail(400, 'Sessione non trovata')
}

/** A PDF that pdf-lib can open (the certificate page is appended to it): not encrypted, not broken. */
export async function assertReadablePdf(data: Uint8Array): Promise<void> {
  try {
    await PDFDocument.load(data, { updateMetadata: false })
  } catch {
    throw fail(422, 'Non riesco a leggere questo PDF: se è protetto da password, carica una copia senza protezione')
  }
}

export interface DocumentFields {
  title: string
  category: DocumentCategory
  description?: string | null
  requiresSignature: boolean
  sessionId?: string | null
}

/** Stores an uploaded PDF and records the document. Returns its id. */
export async function createDocument(
  db: DbOrTx,
  uploadsDir: string,
  input: { data: Uint8Array; filename: string; fields: DocumentFields; actor: Actor },
): Promise<string> {
  await assertReadablePdf(input.data)
  if (input.fields.sessionId) await requireSession(db, input.fields.sessionId)
  const file = await storeFile(db, uploadsDir, {
    data: input.data,
    originalName: input.filename,
    mimeType: 'application/pdf',
    purpose: 'document',
    ownerUserId: null,
    uploadedBy: input.actor.userId,
  })
  const [row] = await db
    .insert(documents)
    .values({
      title: input.fields.title,
      category: input.fields.category,
      description: input.fields.description || null,
      requiresSignature: input.fields.requiresSignature,
      sessionId: input.fields.sessionId ?? null,
      fileId: file.id,
      createdBy: input.actor.userId,
    })
    .returning({ id: documents.id })
  await writeAudit(db, {
    actorUserId: input.actor.userId,
    action: 'document.create',
    entityType: 'document',
    entityId: row!.id,
    data: { title: input.fields.title, requiresSignature: input.fields.requiresSignature },
    ip: input.actor.ip,
  })
  return row!.id
}

async function signedCount(db: DbOrTx, documentId: string): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(signatureRequests)
    .where(and(eq(signatureRequests.documentId, documentId), eq(signatureRequests.status, 'signed')))
  return row?.count ?? 0
}

/** Edits the details. Whether it must be signed changes only while nobody has signed or read it. */
export async function updateDocument(
  db: DbOrTx,
  input: { documentId: string; fields: DocumentFields; actor: Actor },
): Promise<void> {
  const document = await requireDocument(db, input.documentId, 'update')
  if (document.requiresSignature !== input.fields.requiresSignature && (await signedCount(db, document.id)) > 0) {
    throw fail(409, 'Qualcuno lo ha già firmato o letto: non puoi più cambiare se va firmato')
  }
  if (input.fields.sessionId) await requireSession(db, input.fields.sessionId)
  await db
    .update(documents)
    .set({
      title: input.fields.title,
      category: input.fields.category,
      description: input.fields.description || null,
      requiresSignature: input.fields.requiresSignature,
      sessionId: input.fields.sessionId ?? null,
    })
    .where(eq(documents.id, document.id))
  await writeAudit(db, {
    actorUserId: input.actor.userId,
    action: 'document.update',
    entityType: 'document',
    entityId: document.id,
    data: { title: input.fields.title },
    ip: input.actor.ip,
  })
}

/** Replaces the PDF of a document nobody has signed yet. Codes already sent stop working. */
export async function replaceDocumentFile(
  db: DbOrTx,
  uploadsDir: string,
  input: { documentId: string; data: Uint8Array; filename: string; actor: Actor },
): Promise<{ oldFileId: string }> {
  const document = await requireDocument(db, input.documentId, 'update')
  if ((await signedCount(db, document.id)) > 0) {
    throw fail(409, 'Qualcuno lo ha già firmato o letto: carica un nuovo documento invece di sostituirlo')
  }
  await assertReadablePdf(input.data)
  const file = await storeFile(db, uploadsDir, {
    data: input.data,
    originalName: input.filename,
    mimeType: 'application/pdf',
    purpose: 'document',
    ownerUserId: null,
    uploadedBy: input.actor.userId,
  })
  await db.update(documents).set({ fileId: file.id }).where(eq(documents.id, document.id))
  await db
    .update(signatureRequests)
    .set({ otpHash: null, otpExpiresAt: null, otpAttempts: 0 })
    .where(and(eq(signatureRequests.documentId, document.id), eq(signatureRequests.status, 'pending')))
  await writeAudit(db, {
    actorUserId: input.actor.userId,
    action: 'document.replace_file',
    entityType: 'document',
    entityId: document.id,
    data: { sha256: file.sha256 },
    ip: input.actor.ip,
  })
  return { oldFileId: document.fileId }
}

/** Removes the bytes of a replaced file (call after the transaction that replaced it). */
export async function removeReplacedFile(db: DbOrTx, uploadsDir: string, fileId: string): Promise<void> {
  await deleteStoredFile(db, uploadsDir, fileId)
}

/**
 * Archives (or restores) a document. Archiving cancels the requests still to sign, without emails:
 * an archived document cannot be signed nor assigned. Restoring does not reopen them.
 */
export async function setDocumentArchived(
  db: DbOrTx,
  input: { documentId: string; archived: boolean; actor: Actor },
): Promise<{ cancelled: number }> {
  const document = await requireDocument(db, input.documentId, 'update')
  if (Boolean(document.archivedAt) === input.archived) return { cancelled: 0 }
  await db
    .update(documents)
    .set({ archivedAt: input.archived ? new Date() : null })
    .where(eq(documents.id, document.id))
  let cancelled = 0
  if (input.archived) {
    const rows = await db
      .update(signatureRequests)
      .set({ status: 'cancelled', otpHash: null, otpExpiresAt: null, otpAttempts: 0 })
      .where(and(eq(signatureRequests.documentId, document.id), eq(signatureRequests.status, 'pending')))
      .returning({ id: signatureRequests.id })
    cancelled = rows.length
  }
  await writeAudit(db, {
    actorUserId: input.actor.userId,
    action: input.archived ? 'document.archive' : 'document.restore',
    entityType: 'document',
    entityId: document.id,
    data: { cancelled },
    ip: input.actor.ip,
  })
  return { cancelled }
}

// ─── Assignment, reminders, cancellation ────────────────────────────────────────────────────────────

/**
 * The active accounts a target resolves to, without duplicates: chosen family or staff accounts, all
 * families, all approved staff, the titolari of a session invited or confirmed, its accepted staff.
 */
export async function resolveAssignees(db: DbOrTx, target: AssignTarget): Promise<string[]> {
  const active = eq(users.status, 'active')
  let rows: { id: string }[]
  switch (target.type) {
    case 'users':
      if (!target.userIds.length) return []
      rows = await db
        .select({ id: users.id })
        .from(users)
        .where(and(inArray(users.id, target.userIds), active, inArray(users.role, ['family', 'staff'])))
      break
    case 'all_families':
      rows = await db
        .select({ id: users.id })
        .from(users)
        .innerJoin(families, eq(families.userId, users.id))
        .where(and(active, eq(users.role, 'family')))
      break
    case 'all_staff':
      rows = await db
        .select({ id: users.id })
        .from(users)
        .innerJoin(staffProfiles, eq(staffProfiles.userId, users.id))
        .where(and(active, eq(users.role, 'staff'), eq(staffProfiles.status, 'approved')))
      break
    case 'session_families':
      await requireSession(db, target.sessionId)
      rows = await db
        .select({ id: users.id })
        .from(sessionFamilies)
        .innerJoin(families, eq(families.id, sessionFamilies.familyId))
        .innerJoin(users, eq(users.id, families.userId))
        .where(
          and(
            eq(sessionFamilies.sessionId, target.sessionId),
            eq(sessionFamilies.kind, 'slot'),
            inArray(sessionFamilies.status, ['invited', 'confirmed']),
            active,
          ),
        )
      break
    case 'session_staff':
      await requireSession(db, target.sessionId)
      rows = await db
        .select({ id: users.id })
        .from(sessionStaff)
        .innerJoin(users, eq(users.id, sessionStaff.userId))
        .where(and(eq(sessionStaff.sessionId, target.sessionId), eq(sessionStaff.status, 'accepted'), active))
      break
  }
  return [...new Set(rows.map(row => row.id))]
}

/**
 * Assigns a document to a target: one request per person (idempotent, cancelled ones reopen) and one
 * email per new request. `dryRun` only counts, for the confirmation ("Partiranno N email").
 */
export async function assignDocument(
  db: DbOrTx,
  ctx: EmailContext,
  input: { documentId: string; target: AssignTarget; dueDate?: string | null; dryRun?: boolean; actor: Actor },
): Promise<{ result: AssignResult; messages: EmailMessage[] }> {
  const document = await requireDocument(db, input.documentId, 'share')
  if (document.archivedAt) throw fail(409, 'Il documento è archiviato: ripristinalo prima di assegnarlo')
  if (input.dueDate && input.dueDate < todayIso()) throw fail(400, 'La scadenza non può essere nel passato')
  const userIds = await resolveAssignees(db, input.target)
  const existing = userIds.length
    ? await db
        .select({ userId: signatureRequests.userId })
        .from(signatureRequests)
        .where(
          and(
            eq(signatureRequests.documentId, document.id),
            inArray(signatureRequests.userId, userIds),
            ne(signatureRequests.status, 'cancelled'),
          ),
        )
    : []
  const counts = { recipients: userIds.length, alreadyAssigned: existing.length }
  if (input.dryRun) {
    return { result: { ...counts, created: userIds.length - existing.length, dryRun: true }, messages: [] }
  }
  const sessionId = 'sessionId' in input.target ? input.target.sessionId : document.sessionId
  const created = await requestSignatures(db, {
    documentId: document.id,
    userIds,
    sessionId,
    requestedBy: input.actor.userId,
    dueDate: input.dueDate ?? null,
  })
  const messages = await signatureRequestEmails(
    db,
    ctx,
    created.map(row => row.id),
  )
  if (created.length) {
    await writeAudit(db, {
      actorUserId: input.actor.userId,
      action: 'signature.assign',
      entityType: 'document',
      entityId: document.id,
      data: { target: input.target.type, sessionId, created: created.length },
      ip: input.actor.ip,
    })
  }
  return { result: { ...counts, created: created.length, dryRun: false }, messages }
}

/** Reminds one request, or every pending request of a document. */
export async function remindRequests(
  db: DbOrTx,
  ctx: EmailContext,
  input: { requestId?: string; documentId?: string; actor: Actor },
): Promise<EmailMessage[]> {
  let ids: string[]
  if (input.requestId) {
    const [row] = await db
      .select({ status: signatureRequests.status })
      .from(signatureRequests)
      .where(eq(signatureRequests.id, input.requestId))
      .limit(1)
    if (!row) throw fail(404, 'Richiesta non trovata')
    if (row.status !== 'pending') throw fail(409, 'Si può sollecitare solo chi deve ancora firmare')
    ids = [input.requestId]
  } else if (input.documentId) {
    await requireDocument(db, input.documentId)
    const rows = await db
      .select({ id: signatureRequests.id })
      .from(signatureRequests)
      .where(and(eq(signatureRequests.documentId, input.documentId), eq(signatureRequests.status, 'pending')))
    ids = rows.map(row => row.id)
  } else return []
  if (!ids.length) return []
  await db.update(signatureRequests).set({ remindedAt: new Date() }).where(inArray(signatureRequests.id, ids))
  const messages = await signatureRequestEmails(db, ctx, ids, { reminder: true })
  await writeAudit(db, {
    actorUserId: input.actor.userId,
    action: 'signature.remind',
    entityType: input.requestId ? 'signature_request' : 'document',
    entityId: input.requestId ?? input.documentId,
    data: { emails: messages.length },
    ip: input.actor.ip,
  })
  return messages
}

/** Cancels a request still to sign: the person can no longer sign it. No email. */
export async function cancelRequest(db: DbOrTx, input: { requestId: string; actor: Actor }): Promise<void> {
  const [row] = await db
    .update(signatureRequests)
    .set({ status: 'cancelled', otpHash: null, otpExpiresAt: null, otpAttempts: 0 })
    .where(and(eq(signatureRequests.id, input.requestId), eq(signatureRequests.status, 'pending')))
    .returning({ documentId: signatureRequests.documentId, userId: signatureRequests.userId })
  if (!row) {
    const [exists] = await db
      .select({ id: signatureRequests.id })
      .from(signatureRequests)
      .where(eq(signatureRequests.id, input.requestId))
      .limit(1)
    throw exists
      ? fail(409, 'Si può annullare solo una richiesta ancora da firmare')
      : fail(404, 'Richiesta non trovata')
  }
  await writeAudit(db, {
    actorUserId: input.actor.userId,
    action: 'signature.cancel',
    entityType: 'signature_request',
    entityId: input.requestId,
    data: { documentId: row.documentId, userId: row.userId },
    ip: input.actor.ip,
  })
}

// ─── Signing ────────────────────────────────────────────────────────────────────────────────────────

function codeHash(requestId: string, code: string): string {
  return sha256(`${requestId}:${code}`)
}

function codeState(expiresAt: Date, attempts: number): SignatureCodeState {
  return {
    expiresAt: expiresAt.toISOString(),
    resendAt: new Date(expiresAt.getTime() - CODE_TTL_MS + CODE_RESEND_MS).toISOString(),
    attemptsLeft: Math.max(0, CODE_MAX_ATTEMPTS - attempts),
  }
}

/**
 * A request of `userId` with its document, file and person; 404 for anybody else. With `lock`, the
 * document is locked first (requireDocument), so what follows reads the file it has now.
 */
async function requireOwnRequest(db: DbOrTx, requestId: string, userId: string, lock?: DocumentLock) {
  if (lock) {
    const [own] = await db
      .select({ documentId: signatureRequests.documentId })
      .from(signatureRequests)
      .where(and(eq(signatureRequests.id, requestId), eq(signatureRequests.userId, userId)))
      .limit(1)
    if (own) await requireDocument(db, own.documentId, lock)
  }
  const [row] = await db
    .select({
      request: signatureRequests,
      document: documents,
      file: files,
      user: { email: users.email, firstName: users.firstName, lastName: users.lastName },
    })
    .from(signatureRequests)
    .innerJoin(documents, eq(documents.id, signatureRequests.documentId))
    .innerJoin(files, eq(files.id, documents.fileId))
    .innerJoin(users, eq(users.id, signatureRequests.userId))
    .where(eq(signatureRequests.id, requestId))
    .limit(1)
  if (!row || row.request.userId !== userId) throw fail(404, 'Documento non trovato')
  return row
}

function assertPending(status: string): void {
  if (status === 'signed') throw fail(409, 'Hai già firmato questo documento')
  if (status === 'cancelled') throw fail(409, 'Questa richiesta è stata annullata: non serve più firmare')
}

/** An archived document is no longer signed nor read: archiving cancels its requests still to sign. */
function assertNotArchived(document: DocumentRow): void {
  if (!document.archivedAt) return
  throw fail(
    409,
    document.requiresSignature
      ? 'Il documento è stato archiviato: non serve più firmarlo'
      : 'Il documento è stato archiviato: non serve più confermarne la lettura',
  )
}

/** GET /api/signatures/:id */
export async function signaturePage(
  db: DbOrTx,
  requestId: string,
  userId: string,
  now = new Date(),
): Promise<SignaturePage> {
  const { request, document, file, user } = await requireOwnRequest(db, requestId, userId)
  // A request left pending on an archived document can no longer be signed: nothing more to do.
  const status = request.status === 'pending' && document.archivedAt ? 'cancelled' : request.status
  const codeAlive = status === 'pending' && request.otpHash && request.otpExpiresAt && request.otpExpiresAt > now
  return {
    id: request.id,
    status,
    document: {
      title: document.title,
      description: document.description,
      category: document.category,
      requiresSignature: document.requiresSignature,
      file: {
        id: file.id,
        originalName: file.originalName,
        mimeType: file.mimeType,
        sizeBytes: file.sizeBytes,
        createdAt: file.createdAt.toISOString(),
      },
    },
    dueDate: request.dueDate,
    requestedAt: request.requestedAt.toISOString(),
    signedAt: request.signedAt?.toISOString() ?? null,
    signedName: request.signedName,
    email: user.email,
    accountName: fullName(user),
    code: codeAlive ? codeState(request.otpExpiresAt!, request.otpAttempts) : null,
  }
}

/**
 * Sends a new six-digit code (10 minutes, 5 attempts). A new code at most every 60 seconds: the
 * condition sits in the update, so two requests at the same moment cannot both send one.
 */
export async function issueSignatureCode(
  db: DbOrTx,
  ctx: EmailContext,
  input: { requestId: string; userId: string; now?: Date },
): Promise<{ code: string; message: EmailMessage; state: SignatureCodeState }> {
  const { request, document, user } = await requireOwnRequest(db, input.requestId, input.userId)
  assertPending(request.status)
  assertNotArchived(document)
  if (!document.requiresSignature) throw fail(409, 'Questo documento si legge soltanto: non serve un codice')
  const now = input.now ?? new Date()
  const code = otpCode()
  const expiresAt = new Date(now.getTime() + CODE_TTL_MS)
  const sentLongEnoughAgo = new Date(now.getTime() + CODE_TTL_MS - CODE_RESEND_MS)
  const [updated] = await db
    .update(signatureRequests)
    .set({ otpHash: codeHash(request.id, code), otpExpiresAt: expiresAt, otpAttempts: 0 })
    .where(
      and(
        eq(signatureRequests.id, request.id),
        eq(signatureRequests.status, 'pending'),
        or(isNull(signatureRequests.otpExpiresAt), lte(signatureRequests.otpExpiresAt, sentLongEnoughAgo)),
      ),
    )
    .returning({ id: signatureRequests.id })
  if (!updated) {
    const wait = request.otpExpiresAt
      ? Math.max(1, Math.ceil((request.otpExpiresAt.getTime() - CODE_TTL_MS + CODE_RESEND_MS - now.getTime()) / 1000))
      : 60
    throw fail(429, `Ti abbiamo appena inviato un codice: puoi chiederne un altro tra ${wait} secondi`, {
      retryAfter: wait,
    })
  }
  const message = signatureOtpEmail(ctx, {
    to: user.email,
    toUserId: request.userId,
    firstName: user.firstName,
    documentTitle: document.title,
    code,
  })
  return { code, message, state: codeState(expiresAt, 0) }
}

export type SignOutcome =
  | { ok: true; signedAt: Date; signedFileId: string; message: EmailMessage }
  | { ok: false; reason: 'no_code' | 'expired' | 'locked' | 'wrong'; attemptsLeft: number }

/** What the signer reads when the code does not work. */
export const CODE_FAILURES: Record<Exclude<SignOutcome, { ok: true }>['reason'], string> = {
  no_code: 'Chiedi prima il codice: te lo inviamo via email',
  expired: 'Il codice è scaduto: chiedine uno nuovo',
  locked: 'Hai sbagliato il codice troppe volte: chiedine uno nuovo',
  wrong: 'Il codice non è corretto',
}

/**
 * Signs with the code. A wrong, expired or exhausted code is an outcome, not an exception, so the
 * attempt counted here is committed with the transaction of the handler (which then answers 400).
 * On success: SHA-256 of the original, the signed copy stored as `signed_copy` owned by the signer,
 * the request completed, audit `signature.sign`, and the `signature.signed` email to send.
 */
export async function signRequest(
  db: DbOrTx,
  ctx: EmailContext,
  uploadsDir: string,
  input: {
    requestId: string
    userId: string
    code: string
    name: string
    ip: string | null
    userAgent: string | null
    now?: Date
  },
): Promise<SignOutcome> {
  const { request, document, file, user } = await requireOwnRequest(db, input.requestId, input.userId, 'share')
  assertPending(request.status)
  assertNotArchived(document)
  if (!document.requiresSignature) throw fail(409, 'Questo documento si legge soltanto: conferma la lettura')
  if (!request.otpHash) return { ok: false, reason: 'no_code', attemptsLeft: 0 }
  const now = input.now ?? new Date()

  // One attempt counted per try, atomically: a sixth try finds no row.
  const [attempt] = await db
    .update(signatureRequests)
    .set({ otpAttempts: sql`${signatureRequests.otpAttempts} + 1` })
    .where(
      and(
        eq(signatureRequests.id, request.id),
        eq(signatureRequests.status, 'pending'),
        lte(signatureRequests.otpAttempts, CODE_MAX_ATTEMPTS - 1),
      ),
    )
    .returning({
      otpHash: signatureRequests.otpHash,
      otpExpiresAt: signatureRequests.otpExpiresAt,
      otpAttempts: signatureRequests.otpAttempts,
    })
  if (!attempt) {
    // No pending row with attempts left: signed (or cancelled) meanwhile, or the attempts are over.
    const [current] = await db
      .select({ status: signatureRequests.status })
      .from(signatureRequests)
      .where(eq(signatureRequests.id, request.id))
    assertPending(current?.status ?? 'cancelled')
    return { ok: false, reason: 'locked', attemptsLeft: 0 }
  }
  const attemptsLeft = Math.max(0, CODE_MAX_ATTEMPTS - attempt.otpAttempts)
  if (!attempt.otpHash || !attempt.otpExpiresAt) return { ok: false, reason: 'no_code', attemptsLeft: 0 }
  if (attempt.otpExpiresAt <= now) return { ok: false, reason: 'expired', attemptsLeft }
  if (!safeEqualHex(codeHash(request.id, input.code.trim()), attempt.otpHash)) {
    return { ok: false, reason: attemptsLeft > 0 ? 'wrong' : 'locked', attemptsLeft }
  }

  const original = await readStoredFile(uploadsDir, file)
  const documentSha256 = sha256(original)
  const signedName = input.name.trim()
  const userAgent = input.userAgent?.slice(0, 500) || null
  const copy = await storeSignedCopy(db, uploadsDir, {
    original,
    ownerUserId: request.userId,
    originalName: file.originalName,
    certificate: {
      documentTitle: document.title,
      signedName,
      accountName: fullName(user),
      email: user.email,
      signedAt: now,
      ip: input.ip,
      userAgent,
      sha256: documentSha256,
      requestId: request.id,
    },
  })
  const [signed] = await db
    .update(signatureRequests)
    .set({
      status: 'signed',
      signedAt: now,
      signedName,
      signedIp: input.ip,
      signedUserAgent: userAgent,
      documentSha256,
      signedFileId: copy.id,
      otpHash: null,
      otpExpiresAt: null,
    })
    .where(and(eq(signatureRequests.id, request.id), eq(signatureRequests.status, 'pending')))
    .returning({ id: signatureRequests.id })
  if (!signed) {
    await deleteStoredFile(db, uploadsDir, copy.id)
    throw fail(409, 'Hai già firmato questo documento')
  }
  await writeAudit(db, {
    actorUserId: request.userId,
    action: 'signature.sign',
    entityType: 'signature_request',
    entityId: request.id,
    data: { documentId: document.id, sha256: documentSha256 },
    ip: input.ip,
  })
  const message = signatureSignedEmail(ctx, {
    to: user.email,
    toUserId: request.userId,
    firstName: user.firstName,
    documentTitle: document.title,
    requestId: request.id,
    signedAt: now,
    sessionId: request.sessionId,
  })
  return { ok: true, signedAt: now, signedFileId: copy.id, message }
}

/** A document to read: the person confirms the reading (time, IP, user agent, SHA-256), no code. */
export async function confirmReading(
  db: DbOrTx,
  uploadsDir: string,
  input: { requestId: string; userId: string; ip: string | null; userAgent: string | null; now?: Date },
): Promise<void> {
  const { request, document, file, user } = await requireOwnRequest(db, input.requestId, input.userId, 'share')
  if (request.status === 'signed') throw fail(409, 'Hai già confermato la lettura di questo documento')
  assertPending(request.status)
  assertNotArchived(document)
  if (document.requiresSignature) throw fail(409, 'Questo documento va firmato con il codice')
  const now = input.now ?? new Date()
  const documentSha256 = sha256(await readStoredFile(uploadsDir, file))
  const [row] = await db
    .update(signatureRequests)
    .set({
      status: 'signed',
      signedAt: now,
      signedName: fullName(user),
      signedIp: input.ip,
      signedUserAgent: input.userAgent?.slice(0, 500) || null,
      documentSha256,
    })
    .where(and(eq(signatureRequests.id, request.id), eq(signatureRequests.status, 'pending')))
    .returning({ id: signatureRequests.id })
  if (!row) throw fail(409, 'Hai già confermato la lettura di questo documento')
  await writeAudit(db, {
    actorUserId: request.userId,
    action: 'signature.read',
    entityType: 'signature_request',
    entityId: request.id,
    data: { documentId: document.id, sha256: documentSha256 },
    ip: input.ip,
  })
}

// ─── The signed copy ────────────────────────────────────────────────────────────────────────────────

export interface CertificateData {
  documentTitle: string
  /** The full name typed by the signer. */
  signedName: string
  accountName: string
  email: string
  signedAt: Date
  ip: string | null
  userAgent: string | null
  sha256: string
  requestId: string
}

/** "Regolamento 2027 (firmato).pdf" */
function signedCopyName(originalName: string): string {
  return cleanName(`${originalName.replace(/\.pdf$/i, '')} (firmato).pdf`)
}

async function storeSignedCopy(
  db: DbOrTx,
  uploadsDir: string,
  input: { original: Uint8Array; ownerUserId: string; originalName: string; certificate: CertificateData },
): Promise<FileRow> {
  let data: Uint8Array
  try {
    data = await buildSignedPdf(input.original, input.certificate)
  } catch {
    throw fail(500, 'Non riesco a preparare la copia firmata di questo PDF: avvisa l’amministrazione del camp')
  }
  return storeFile(db, uploadsDir, {
    data,
    originalName: signedCopyName(input.originalName),
    mimeType: 'application/pdf',
    purpose: 'signed_copy',
    ownerUserId: input.ownerUserId,
    uploadedBy: input.ownerUserId,
  })
}

/**
 * The signed copy of a signed request (to download): requests signed before copies existed (the
 * demo data) get theirs now, built from what the request recorded at signing.
 */
export async function ensureSignedCopy(db: DbOrTx, uploadsDir: string, requestId: string): Promise<FileRow> {
  const [row] = await db
    .select({
      request: signatureRequests,
      document: documents,
      file: files,
      user: { email: users.email, firstName: users.firstName, lastName: users.lastName },
    })
    .from(signatureRequests)
    .innerJoin(documents, eq(documents.id, signatureRequests.documentId))
    .innerJoin(files, eq(files.id, documents.fileId))
    .innerJoin(users, eq(users.id, signatureRequests.userId))
    .where(eq(signatureRequests.id, requestId))
    .limit(1)
  if (!row || row.request.status !== 'signed' || !row.document.requiresSignature) {
    throw fail(404, 'La copia firmata non è disponibile')
  }
  const fileById = async (id: string | null) =>
    id ? (await db.select().from(files).where(eq(files.id, id)).limit(1))[0] : undefined
  // The foreign key empties signedFileId when its file is removed, so a set id always has its row.
  const current = await fileById(row.request.signedFileId)
  if (current) return current

  const { request, document, file, user } = row
  const copy = await storeSignedCopy(db, uploadsDir, {
    original: await readStoredFile(uploadsDir, file),
    ownerUserId: request.userId,
    originalName: file.originalName,
    certificate: {
      documentTitle: document.title,
      signedName: request.signedName ?? fullName(user),
      accountName: fullName(user),
      email: user.email,
      signedAt: request.signedAt ?? request.updatedAt,
      ip: request.signedIp,
      userAgent: request.signedUserAgent,
      sha256: request.documentSha256 ?? file.sha256,
      requestId: request.id,
    },
  })
  const [claimed] = await db
    .update(signatureRequests)
    .set({ signedFileId: copy.id })
    .where(and(eq(signatureRequests.id, request.id), isNull(signatureRequests.signedFileId)))
    .returning({ id: signatureRequests.id })
  if (claimed) return copy
  // Somebody else generated it at the same moment: keep theirs.
  await deleteStoredFile(db, uploadsDir, copy.id)
  const [again] = await db
    .select({ signedFileId: signatureRequests.signedFileId })
    .from(signatureRequests)
    .where(eq(signatureRequests.id, request.id))
  const theirs = await fileById(again?.signedFileId ?? null)
  if (!theirs) throw fail(404, 'La copia firmata non è disponibile')
  return theirs
}

const A4: [number, number] = [595.28, 841.89]
const MARGIN = 56
const INK = rgb(0.12, 0.11, 0.1)
const MUTED = rgb(0.36, 0.33, 0.27)
const BLUE = rgb(0.114, 0.373, 0.69)

const signatureTime = new Intl.DateTimeFormat(LOCALE, {
  timeZone: TIME_ZONE,
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
})

/** "29 ottobre 2026, 19:30:00 (ora italiana)" */
export function formatSignatureTime(date: Date): string {
  return `${signatureTime.format(date).replace(/ alle ore |, /, ', ')} (ora italiana)`
}

/**
 * Text the standard fonts can draw (WinAnsi): accented letters outside it lose the accent ("ł" stays
 * "?", "ș" becomes "s"), control characters become spaces, anything else becomes "?".
 */
export function toWinAnsi(font: PDFFont, text: string): string {
  const supported = new Set(font.getCharacterSet())
  let out = ''
  for (const char of text.normalize('NFC').replace(/[\u0000-\u001f\u007f]/g, ' ')) {
    if (supported.has(char.codePointAt(0)!)) {
      out += char
      continue
    }
    const base = char.normalize('NFD').replace(/\p{M}/gu, '')
    out += base && [...base].every(c => supported.has(c.codePointAt(0)!)) ? base : '?'
  }
  return out
}

/** Lines of at most `width` points; words longer than a line are cut. */
function wrap(font: PDFFont, text: string, size: number, width: number): string[] {
  const lines: string[] = []
  let line = ''
  for (const word of text.split(/\s+/).filter(Boolean)) {
    let piece = word
    while (font.widthOfTextAtSize(piece, size) > width) {
      let cut = piece.length - 1
      while (cut > 1 && font.widthOfTextAtSize(piece.slice(0, cut), size) > width) cut--
      if (line) lines.push(line)
      lines.push(piece.slice(0, cut))
      line = ''
      piece = piece.slice(cut)
    }
    const next = line ? `${line} ${piece}` : piece
    if (font.widthOfTextAtSize(next, size) > width) {
      lines.push(line)
      line = piece
    } else line = next
  }
  if (line) lines.push(line)
  return lines.length ? lines : ['']
}

/** The original PDF with the signature certificate appended as its last page. */
export async function buildSignedPdf(
  original: Uint8Array,
  data: CertificateData,
  now = new Date(),
): Promise<Uint8Array> {
  const pdf = await PDFDocument.load(original, { updateMetadata: false })
  const page = pdf.addPage(A4)
  const regular = await pdf.embedFont(StandardFonts.Helvetica)
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold)
  const mono = await pdf.embedFont(StandardFonts.Courier)
  const width = A4[0] - MARGIN * 2
  let y = A4[1] - MARGIN

  const draw = (target: PDFPage, text: string, font: PDFFont, size: number, color = INK, gap = 4) => {
    for (const line of wrap(font, toWinAnsi(font, text), size, width)) {
      y -= size
      target.drawText(line, { x: MARGIN, y, size, font, color })
      y -= gap
    }
  }

  draw(page, 'Invictus Camp', bold, 11, BLUE)
  y -= 14
  draw(page, 'Certificato di firma elettronica', bold, 20)
  y -= 6
  draw(
    page,
    'Questa pagina è stata aggiunta dal gestionale di Invictus Camp al documento originale, che la precede, e certifica la firma descritta qui sotto.',
    regular,
    10.5,
    MUTED,
  )
  y -= 18

  const rows: [string, string, PDFFont, number][] = [
    ['Documento', data.documentTitle, regular, 11.5],
    ['Firmato da (nome scritto da chi firma)', data.signedName, bold, 11.5],
    ['Account', `${data.accountName}, ${data.email}`, regular, 11.5],
    ['Data e ora della firma', formatSignatureTime(data.signedAt), regular, 11.5],
    ['Indirizzo IP', data.ip || 'Non registrato', regular, 11.5],
    ['Dispositivo (user agent)', data.userAgent || 'Non registrato', regular, 10],
    ['Impronta SHA-256 del documento originale', data.sha256, mono, 10],
    ['Identificativo della richiesta di firma', data.requestId, mono, 10],
    ['Metodo', SIGNATURE_METHOD, regular, 11.5],
  ]
  for (const [label, value, font, size] of rows) {
    draw(page, label, bold, 9.5, MUTED, 3)
    draw(page, value, font, size)
    y -= 10
    page.drawLine({
      start: { x: MARGIN, y: y + 4 },
      end: { x: A4[0] - MARGIN, y: y + 4 },
      thickness: 0.5,
      color: rgb(0.9, 0.87, 0.8),
    })
    y -= 8
  }

  y -= 8
  draw(
    page,
    'Firma elettronica semplice (FES) ai sensi dell’art. 25 del Regolamento (UE) n. 910/2014 (eIDAS) e dell’art. 20 del Codice dell’amministrazione digitale (D.Lgs. 82/2005). Il codice monouso è stato inviato all’indirizzo email dell’account e inserito da chi firma entro 10 minuti. L’impronta SHA-256 identifica il file originale: ricalcolandola su quel file si verifica che il documento firmato è proprio quello.',
    regular,
    9.5,
    MUTED,
    3,
  )
  page.drawText(toWinAnsi(regular, `Pagina generata dal gestionale di Invictus Camp il ${formatSignatureTime(now)}.`), {
    x: MARGIN,
    y: MARGIN - 16,
    size: 8.5,
    font: regular,
    color: MUTED,
  })
  return pdf.save()
}

// ─── Reading: lists and details ─────────────────────────────────────────────────────────────────────

const STATUS_ORDER = sql`case ${signatureRequests.status} when 'pending' then 0 when 'signed' then 1 else 2 end`

/** Requests with their person and document, pending first. */
export async function signatureRows(
  db: DbOrTx,
  where: SQL | undefined,
  order: 'person' | 'recent' = 'person',
): Promise<SignatureRequestRow[]> {
  const rows = await db
    .select({
      request: {
        id: signatureRequests.id,
        status: signatureRequests.status,
        sessionId: signatureRequests.sessionId,
        requestedAt: signatureRequests.requestedAt,
        dueDate: signatureRequests.dueDate,
        remindedAt: signatureRequests.remindedAt,
        signedAt: signatureRequests.signedAt,
        signedName: signatureRequests.signedName,
      },
      person: {
        id: users.id,
        firstName: users.firstName,
        lastName: users.lastName,
        email: users.email,
        role: users.role,
      },
      familyName: families.name,
      document: {
        id: documents.id,
        title: documents.title,
        category: documents.category,
        requiresSignature: documents.requiresSignature,
      },
    })
    .from(signatureRequests)
    .innerJoin(users, eq(users.id, signatureRequests.userId))
    .innerJoin(documents, eq(documents.id, signatureRequests.documentId))
    .leftJoin(families, eq(families.userId, users.id))
    .where(where)
    .orderBy(
      STATUS_ORDER,
      ...(order === 'recent'
        ? [desc(signatureRequests.requestedAt), asc(documents.title)]
        : [asc(users.lastName), asc(users.firstName)]),
    )
  return rows.map(({ request, person, familyName, document }) => ({
    id: request.id,
    status: request.status,
    person: {
      id: person.id,
      name: fullName(person),
      email: person.email,
      role: person.role,
      familyName,
    },
    document,
    sessionId: request.sessionId,
    requestedAt: request.requestedAt.toISOString(),
    dueDate: request.dueDate,
    remindedAt: request.remindedAt?.toISOString() ?? null,
    signedAt: request.signedAt?.toISOString() ?? null,
    signedName: request.signedName,
    hasSignedCopy: request.status === 'signed' && document.requiresSignature,
  }))
}

/**
 * Every document, newest first, with its progress. With `sessionId`: the documents of that session
 * (its own, or assigned to people for that session), counting only the requests of the session.
 */
export async function listDocuments(db: DbOrTx, options: { sessionId?: string } = {}): Promise<DocumentListItem[]> {
  const { sessionId } = options
  const inSession = sessionId ? sql` and ${signatureRequests.sessionId} = ${sessionId}` : sql``
  const rows = await db
    .select({
      id: documents.id,
      title: documents.title,
      category: documents.category,
      requiresSignature: documents.requiresSignature,
      createdAt: documents.createdAt,
      archivedAt: documents.archivedAt,
      sessionId: campSessions.id,
      sessionTitle: campSessions.title,
      assigned: sql<number>`(count(${signatureRequests.id}) filter (where ${signatureRequests.status} <> 'cancelled'${inSession}))::int`,
      signed: sql<number>`(count(${signatureRequests.id}) filter (where ${signatureRequests.status} = 'signed'${inSession}))::int`,
    })
    .from(documents)
    .leftJoin(campSessions, eq(campSessions.id, documents.sessionId))
    .leftJoin(signatureRequests, eq(signatureRequests.documentId, documents.id))
    .where(
      sessionId
        ? or(
            eq(documents.sessionId, sessionId),
            inArray(
              documents.id,
              db
                .select({ id: signatureRequests.documentId })
                .from(signatureRequests)
                .where(eq(signatureRequests.sessionId, sessionId)),
            ),
          )
        : undefined,
    )
    .groupBy(documents.id, campSessions.id)
    .orderBy(desc(documents.createdAt))
  // Who each document went to (point 7: filter families / staff / v-team), from its live requests.
  const audienceRows = await db
    .selectDistinct({
      documentId: signatureRequests.documentId,
      audience: sql<DocumentAudience>`case when ${users.role} = 'family' then 'family' when ${staffProfiles.team} = 'volunteer' then 'volunteer' else 'staff' end`,
    })
    .from(signatureRequests)
    .innerJoin(users, eq(users.id, signatureRequests.userId))
    .leftJoin(staffProfiles, eq(staffProfiles.userId, users.id))
    .where(
      and(
        ne(signatureRequests.status, 'cancelled'),
        ne(users.role, 'admin'),
        sessionId ? eq(signatureRequests.sessionId, sessionId) : undefined,
      ),
    )
  const audiences = new Map<string, DocumentAudience[]>()
  for (const row of audienceRows)
    audiences.set(row.documentId, [...(audiences.get(row.documentId) ?? []), row.audience])
  return rows.map(row => ({
    id: row.id,
    title: row.title,
    category: row.category,
    requiresSignature: row.requiresSignature,
    session: row.sessionId && row.sessionTitle ? { id: row.sessionId, title: row.sessionTitle } : null,
    progress: { assigned: row.assigned, signed: row.signed },
    audiences: DOCUMENT_AUDIENCES.filter(audience => audiences.get(row.id)?.includes(audience)),
    createdAt: row.createdAt.toISOString(),
    archivedAt: row.archivedAt?.toISOString() ?? null,
  }))
}

/** GET /api/admin/documents/:id */
export async function documentDetail(db: DbOrTx, documentId: string): Promise<DocumentDetail> {
  const [row] = await db
    .select({
      document: documents,
      file: files,
      session: { id: campSessions.id, title: campSessions.title },
      author: { firstName: users.firstName, lastName: users.lastName },
    })
    .from(documents)
    .innerJoin(files, eq(files.id, documents.fileId))
    .leftJoin(campSessions, eq(campSessions.id, documents.sessionId))
    .leftJoin(users, eq(users.id, documents.createdBy))
    .where(eq(documents.id, documentId))
    .limit(1)
  if (!row) throw fail(404, 'Documento non trovato')
  const { document, file, session, author } = row
  const requests = await signatureRows(db, eq(signatureRequests.documentId, document.id))
  const live = requests.filter(r => r.status !== 'cancelled')
  return {
    id: document.id,
    title: document.title,
    category: document.category,
    requiresSignature: document.requiresSignature,
    session: session?.id ? { id: session.id, title: session.title } : null,
    progress: { assigned: live.length, signed: live.filter(r => r.status === 'signed').length },
    createdAt: document.createdAt.toISOString(),
    archivedAt: document.archivedAt?.toISOString() ?? null,
    description: document.description,
    file: {
      id: file.id,
      originalName: file.originalName,
      mimeType: file.mimeType,
      sizeBytes: file.sizeBytes,
      createdAt: file.createdAt.toISOString(),
      sha256: file.sha256,
    },
    createdBy: author?.firstName ? fullName(author) : null,
    locked: live.some(r => r.status === 'signed'),
    requests,
  }
}

/** GET /api/admin/documents/options */
export async function documentOptions(db: DbOrTx): Promise<DocumentOptions> {
  const sessions = await db
    .select({
      id: campSessions.id,
      title: campSessions.title,
      startDate: campSessions.startDate,
      endDate: campSessions.endDate,
      status: campSessions.status,
    })
    .from(campSessions)
    .where(ne(campSessions.status, 'cancelled'))
    .orderBy(desc(campSessions.startDate))
  const people = await db
    .select({
      id: users.id,
      firstName: users.firstName,
      lastName: users.lastName,
      email: users.email,
      role: users.role,
      familyName: families.name,
    })
    .from(users)
    .leftJoin(families, eq(families.userId, users.id))
    .where(and(eq(users.status, 'active'), inArray(users.role, ['family', 'staff'])))
    .orderBy(asc(users.lastName), asc(users.firstName))
  const docs = await db
    .select({
      id: documents.id,
      title: documents.title,
      requiresSignature: documents.requiresSignature,
      sessionId: documents.sessionId,
    })
    .from(documents)
    .where(isNull(documents.archivedAt))
    .orderBy(desc(documents.createdAt))
  return {
    sessions,
    people: people.map((p): AssignablePerson => ({
      id: p.id,
      name: fullName(p),
      email: p.email,
      role: p.role === 'family' ? 'family' : 'staff',
      familyName: p.familyName,
    })),
    documents: docs,
  }
}

/**
 * GET /api/signatures: the documents of one account, to sign first; cancelled ones left out, and so
 * are those still to sign of an archived document (signaturePage shows them as cancelled).
 */
export async function mySignatures(db: DbOrTx, userId: string): Promise<MySignatureItem[]> {
  const rows = await db
    .select({
      id: signatureRequests.id,
      status: signatureRequests.status,
      requestedAt: signatureRequests.requestedAt,
      dueDate: signatureRequests.dueDate,
      signedAt: signatureRequests.signedAt,
      title: documents.title,
      category: documents.category,
      requiresSignature: documents.requiresSignature,
    })
    .from(signatureRequests)
    .innerJoin(documents, eq(documents.id, signatureRequests.documentId))
    .where(
      and(
        eq(signatureRequests.userId, userId),
        ne(signatureRequests.status, 'cancelled'),
        or(ne(signatureRequests.status, 'pending'), isNull(documents.archivedAt)),
      ),
    )
    .orderBy(STATUS_ORDER, sql`${signatureRequests.dueDate} asc nulls last`, desc(signatureRequests.requestedAt))
  return rows.map(row => ({
    id: row.id,
    status: row.status,
    document: { title: row.title, category: row.category, requiresSignature: row.requiresSignature },
    requestedAt: row.requestedAt.toISOString(),
    dueDate: row.dueDate,
    signedAt: row.signedAt?.toISOString() ?? null,
  }))
}

/** Development only: the last code sent for each request, for scripts that sign (GET /api/dev/otp/:id). */
export const devCodes = new Map<string, string>()
