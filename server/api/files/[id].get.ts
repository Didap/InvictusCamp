import { and, eq, ne, or } from 'drizzle-orm'

/**
 * Downloads a stored file (?download for an attachment, otherwise inline for the preview). Allowed to
 * the administration, to the account the file belongs to or that uploaded it, and to whoever must sign
 * the document (the original) or signed it (their signed copy). Anyone else gets 404.
 */
export default defineEventHandler(async event => {
  const user = await requireUser(event)
  const file = await requireFileRow(requireUuidParam(event, 'id'))
  const allowed =
    user.role === 'admin' ||
    file.ownerUserId === user.id ||
    file.uploadedBy === user.id ||
    (await isSignerOf(user.id, file.id))
  if (!allowed) throw createError({ statusCode: 404, message: 'File non trovato' })
  return sendFile(event, file, { download: getQuery(event).download !== undefined })
})

async function isSignerOf(userId: string, fileId: string): Promise<boolean> {
  const { signatureRequests, documents } = tables
  const [row] = await useDb()
    .select({ id: signatureRequests.id })
    .from(signatureRequests)
    .innerJoin(documents, eq(documents.id, signatureRequests.documentId))
    .where(
      and(
        eq(signatureRequests.userId, userId),
        ne(signatureRequests.status, 'cancelled'),
        or(eq(documents.fileId, fileId), eq(signatureRequests.signedFileId, fileId)),
      ),
    )
    .limit(1)
  return Boolean(row)
}
