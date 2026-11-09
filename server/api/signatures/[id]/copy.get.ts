import { eq } from 'drizzle-orm'
import { ensureSignedCopy } from '~~/server/domain/signatures'

/**
 * The signed copy (?download for an attachment), to the signer and to the administration. Requests
 * signed without a copy (the demo data) get it generated here, at the first download.
 */
export default defineEventHandler(async event => {
  const user = await requireRole(event, 'admin', 'family', 'staff')
  const requestId = requireUuidParam(event, 'id')
  const db = useDb()
  const [request] = await db
    .select({ userId: tables.signatureRequests.userId })
    .from(tables.signatureRequests)
    .where(eq(tables.signatureRequests.id, requestId))
    .limit(1)
  if (!request || (user.role !== 'admin' && request.userId !== user.id)) {
    throw createError({ statusCode: 404, message: 'Documento non trovato' })
  }
  const file = await ensureSignedCopy(db, uploadsDir(), requestId)
  return sendFile(event, file, { download: getQuery(event).download !== undefined })
})
