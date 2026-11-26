// «Risorse utili» of staff and v-team (docs/spec.md 3.6): documents of the documents area the administration puts
// there, to read and accept (each approved person asked to confirm the reading, or to sign, as the document says;
// someone approved later is asked too, without an email) or only to consult. Explicit imports only.
import { and, asc, eq, inArray, isNull, isNotNull, ne } from 'drizzle-orm'
import type { MyStaffResource } from '../../shared/types/documents'
import type { StaffResourceMode } from '../../shared/utils/constants'
import { documents, files, signatureRequests, staffProfiles, users } from '../db/schema'
import type { EmailContext, EmailMessage } from '../emails/types'
import { writeAudit } from './audit'
import type { DbOrTx } from './db'
import { DomainError } from './errors'
import { requestSignatures, signatureRequestEmails } from './signature-requests'
import type { Actor } from './users'

/** The approved staff and v-team with an account that is not disabled: who a resource to accept asks. */
async function approvedStaff(db: DbOrTx): Promise<string[]> {
  const rows = await db
    .select({ id: users.id })
    .from(staffProfiles)
    .innerJoin(users, eq(users.id, staffProfiles.userId))
    .where(and(eq(staffProfiles.status, 'approved'), ne(users.status, 'disabled')))
  return rows.map(row => row.id)
}

/**
 * Puts a document in the «Risorse utili» (or takes it out). To accept: every approved person is asked, with an email
 * each (returned; `dryRun` only counts them). Taking it out leaves the requests already made.
 */
export async function setStaffResource(
  db: DbOrTx,
  input: { documentId: string; mode: StaffResourceMode | null; dryRun?: boolean; ctx: EmailContext; actor: Actor },
): Promise<{ emails: EmailMessage[]; asked: number }> {
  const [document] = await db.select().from(documents).where(eq(documents.id, input.documentId)).for('update')
  if (!document) throw new DomainError(404, 'Documento non trovato')
  if (document.familyId || document.staffUserId) {
    throw new DomainError(409, 'È un documento preparato dal gestionale per una persona: non va tra le risorse')
  }
  if (document.archivedAt && input.mode) throw new DomainError(409, 'Il documento è archiviato: ripristinalo prima')
  const toAsk = input.mode === 'accept' ? await approvedStaff(db) : []
  if (input.dryRun) {
    // Those already asked (a cancelled request is asked again) get no new email.
    const asked = toAsk.length
      ? await db
          .select({ userId: signatureRequests.userId })
          .from(signatureRequests)
          .where(
            and(
              eq(signatureRequests.documentId, document.id),
              inArray(signatureRequests.userId, toAsk),
              ne(signatureRequests.status, 'cancelled'),
            ),
          )
      : []
    return { emails: [], asked: toAsk.length - asked.length }
  }
  await db.update(documents).set({ staffResource: input.mode }).where(eq(documents.id, document.id))
  const requests = await requestSignatures(db, { documentId: document.id, userIds: toAsk })
  await writeAudit(db, {
    actorUserId: input.actor.userId,
    action: 'document.staff_resource',
    entityType: 'document',
    entityId: document.id,
    data: { from: document.staffResource, to: input.mode, asked: requests.length },
    ip: input.actor.ip ?? null,
  })
  return {
    emails: await signatureRequestEmails(
      db,
      input.ctx,
      requests.map(request => request.id),
    ),
    asked: requests.length,
  }
}

/** Someone just approved: the resources to accept ask them too, without an email (they see them on their pages). */
export async function askStaffResources(db: DbOrTx, userIds: string[]): Promise<void> {
  if (!userIds.length) return
  const resources = await db
    .select({ id: documents.id })
    .from(documents)
    .where(and(eq(documents.staffResource, 'accept'), isNull(documents.archivedAt)))
  for (const resource of resources) await requestSignatures(db, { documentId: resource.id, userIds })
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
    request:
      document.staffResource === 'accept' && request
        ? {
            id: request.id,
            status: request.status,
            signedAt: request.signedAt?.toISOString() ?? null,
            requiresSignature: document.requiresSignature,
          }
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
        inArray(staffProfiles.status, ['approved', 'inactive']),
      ),
    )
    .limit(1)
  return Boolean(row)
}
