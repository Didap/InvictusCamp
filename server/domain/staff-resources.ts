// «Risorse utili» of staff and v-team (docs/spec.md 3.6): documents of the documents area the administration puts
// there, to read and accept or only to consult. To accept: every approved person is asked as with «Assegna → tutto lo
// staff» (assignDocument, one email each); whoever has no request yet (approved later, re-enabled, after a restore)
// gets it when they open the resource. Explicit imports only, so the database tests can load it.
import { and, asc, eq, inArray, isNotNull, isNull, ne } from 'drizzle-orm'
import type { AssignResult, MyStaffResource } from '../../shared/types/documents'
import { STAFF_STATUSES, inStaffArea, type StaffResourceMode } from '../../shared/utils/constants'
import { documents, files, signatureRequests, staffProfiles, users } from '../db/schema'
import type { EmailContext, EmailMessage } from '../emails/types'
import { writeAudit } from './audit'
import type { DbOrTx } from './db'
import { DomainError } from './errors'
import { requestSignatures } from './signature-requests'
import { assignDocument } from './signatures'
import type { Actor } from './users'

const NOT_FOUND = 'Documento non trovato'
const STAFF_AREA = STAFF_STATUSES.filter(inStaffArea)

/**
 * Puts a document in the «Risorse utili» (or takes it out). To accept: every approved person not asked yet gets the
 * request and its email (`dryRun` only counts them, as the assignment does); choosing it again asks whoever is missing.
 * Leaving «accept» cancels the staff's requests still to answer.
 */
export async function setStaffResource(
  db: DbOrTx,
  input: { documentId: string; mode: StaffResourceMode | null; dryRun?: boolean; ctx: EmailContext; actor: Actor },
): Promise<{ result: AssignResult | null; messages: EmailMessage[] }> {
  const [document] = await db.select().from(documents).where(eq(documents.id, input.documentId)).for('update')
  if (!document) throw new DomainError(404, NOT_FOUND)
  if (document.familyId || document.staffUserId) {
    throw new DomainError(409, 'È un documento preparato dal gestionale per una persona: non va tra le risorse')
  }
  if (document.archivedAt && input.mode) throw new DomainError(409, 'Il documento è archiviato: ripristinalo prima')
  const asked =
    input.mode === 'accept'
      ? await assignDocument(db, input.ctx, {
          documentId: document.id,
          target: { type: 'all_staff' },
          dryRun: input.dryRun,
          actor: input.actor,
        })
      : { result: null, messages: [] }
  if (input.dryRun || document.staffResource === input.mode) return asked
  if (document.staffResource === 'accept') {
    await db
      .update(signatureRequests)
      .set({ status: 'cancelled', otpHash: null, otpExpiresAt: null, otpAttempts: 0 })
      .where(
        and(
          eq(signatureRequests.documentId, document.id),
          eq(signatureRequests.status, 'pending'),
          inArray(signatureRequests.userId, db.select({ id: users.id }).from(users).where(eq(users.role, 'staff'))),
        ),
      )
  }
  await db.update(documents).set({ staffResource: input.mode }).where(eq(documents.id, document.id))
  await writeAudit(db, {
    actorUserId: input.actor.userId,
    action: 'document.staff_resource',
    entityType: 'document',
    entityId: document.id,
    data: { from: document.staffResource, to: input.mode },
    ip: input.actor.ip ?? null,
  })
  return asked
}

/**
 * «Leggi e accetta» on a resource: the person's request, made (or reopened) now if missing, without an email. Returns
 * its id, for /firma.
 */
export async function openStaffResource(db: DbOrTx, input: { userId: string; documentId: string }): Promise<string> {
  const [document] = await db
    .select({ id: documents.id })
    .from(documents)
    .where(and(eq(documents.id, input.documentId), eq(documents.staffResource, 'accept'), isNull(documents.archivedAt)))
    .for('share')
  if (!document) throw new DomainError(404, NOT_FOUND)
  await requestSignatures(db, { documentId: document.id, userIds: [input.userId] })
  const [request] = await db
    .select({ id: signatureRequests.id })
    .from(signatureRequests)
    .where(and(eq(signatureRequests.documentId, document.id), eq(signatureRequests.userId, input.userId)))
  return request!.id
}

/** The «Risorse utili» of the signed-in person: each with their request, for those to accept. */
export async function myStaffResources(db: DbOrTx, userId: string): Promise<MyStaffResource[]> {
  const rows = await db
    .select({ document: documents, file: files, request: signatureRequests })
    .from(documents)
    .innerJoin(files, eq(files.id, documents.fileId))
    .leftJoin(
      signatureRequests,
      and(
        eq(signatureRequests.documentId, documents.id),
        eq(signatureRequests.userId, userId),
        ne(signatureRequests.status, 'cancelled'),
      ),
    )
    .where(and(isNotNull(documents.staffResource), isNull(documents.archivedAt)))
    .orderBy(asc(documents.title))
  return rows.map(({ document, file, request }) => ({
    id: document.id,
    title: document.title,
    description: document.description,
    category: document.category,
    mode: document.staffResource!,
    file: {
      id: file.id,
      originalName: file.originalName,
      mimeType: file.mimeType,
      sizeBytes: file.sizeBytes,
      createdAt: file.createdAt.toISOString(),
    },
    requiresSignature: document.requiresSignature,
    request:
      document.staffResource === 'accept' && request
        ? { id: request.id, status: request.status, signedAt: request.signedAt?.toISOString() ?? null }
        : null,
  }))
}

/** A staff member in the staff area may open the file of a resource (GET /api/files/:id). */
export async function isStaffResourceFile(db: DbOrTx, userId: string, fileId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: documents.id })
    .from(documents)
    .innerJoin(staffProfiles, eq(staffProfiles.userId, userId))
    .where(
      and(
        eq(documents.fileId, fileId),
        isNotNull(documents.staffResource),
        isNull(documents.archivedAt),
        inArray(staffProfiles.status, STAFF_AREA),
      ),
    )
    .limit(1)
  return Boolean(row)
}
