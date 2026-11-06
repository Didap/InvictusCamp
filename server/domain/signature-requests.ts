// Assigning a document to people. Used by the documents area (assign to users, roles, a session) and
// by the staff area (the contract of a session after a convocation is accepted). Idempotent: an
// existing request is kept as it is; a cancelled one is reopened.
import { and, eq, inArray, sql } from 'drizzle-orm'
import { documents, signatureRequests, users } from '../db/schema'
import { signatureRequestEmail } from '../emails/signatures'
import type { EmailContext, EmailMessage } from '../emails/types'
import type { DbOrTx } from './db'

export interface RequestSignaturesInput {
  documentId: string
  userIds: string[]
  sessionId?: string | null
  requestedBy?: string | null
  dueDate?: string | null
}

/** Creates (or reopens) the requests and returns the ones that need an email. */
export async function requestSignatures(
  db: DbOrTx,
  input: RequestSignaturesInput,
): Promise<{ id: string; userId: string }[]> {
  const userIds = [...new Set(input.userIds)]
  if (!userIds.length) return []
  return db
    .insert(signatureRequests)
    .values(
      userIds.map(userId => ({
        documentId: input.documentId,
        userId,
        sessionId: input.sessionId ?? null,
        requestedBy: input.requestedBy ?? null,
        dueDate: input.dueDate ?? null,
        status: 'pending' as const,
      })),
    )
    .onConflictDoUpdate({
      target: [signatureRequests.documentId, signatureRequests.userId],
      set: {
        status: 'pending',
        requestedAt: sql`now()`,
        requestedBy: input.requestedBy ?? null,
        dueDate: input.dueDate ?? null,
        otpHash: null,
        otpExpiresAt: null,
        otpAttempts: 0,
      },
      where: eq(signatureRequests.status, 'cancelled'),
    })
    .returning({ id: signatureRequests.id, userId: signatureRequests.userId })
}

/** The "document to sign" emails for the given requests. */
export async function signatureRequestEmails(
  db: DbOrTx,
  ctx: EmailContext,
  requestIds: string[],
  options: { reminder?: boolean } = {},
): Promise<EmailMessage[]> {
  if (!requestIds.length) return []
  const rows = await db
    .select({
      id: signatureRequests.id,
      dueDate: signatureRequests.dueDate,
      sessionId: signatureRequests.sessionId,
      userId: users.id,
      email: users.email,
      firstName: users.firstName,
      userStatus: users.status,
      title: documents.title,
    })
    .from(signatureRequests)
    .innerJoin(users, eq(users.id, signatureRequests.userId))
    .innerJoin(documents, eq(documents.id, signatureRequests.documentId))
    .where(and(inArray(signatureRequests.id, requestIds), eq(signatureRequests.status, 'pending')))
  return rows
    .filter(row => row.userStatus !== 'disabled')
    .map(row =>
      signatureRequestEmail(ctx, {
        to: row.email,
        toUserId: row.userId,
        firstName: row.firstName,
        documentTitle: row.title,
        requestId: row.id,
        dueDate: row.dueDate,
        sessionId: row.sessionId,
        reminder: options.reminder,
      }),
    )
}
