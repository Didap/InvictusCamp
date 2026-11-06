import { readConfirmSchema } from '#shared/schemas/documents'
import type { SignaturePage } from '#shared/types/documents'
import { confirmReading, signaturePage } from '~~/server/domain/signatures'

/** A document to read: the person confirms having read it (no code, no signed copy). */
export default defineEventHandler(async (event): Promise<SignaturePage> => {
  const user = await requireRole(event, 'family', 'staff')
  const requestId = requireUuidParam(event, 'id')
  await parseBody(event, readConfirmSchema)
  const db = useDb()
  await db.transaction(tx =>
    confirmReading(tx, uploadsDir(), {
      requestId,
      userId: user.id,
      ip: clientIp(event),
      userAgent: getRequestHeader(event, 'user-agent') ?? null,
    }),
  )
  return signaturePage(db, requestId, user.id)
})
