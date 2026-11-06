import { eq } from 'drizzle-orm'
import { devCodes } from '~~/server/domain/signatures'

/**
 * Development only: the last code sent for a signature request, so scripts can sign as the signed-in
 * account (or as the administration). 404 outside development and when no code was sent.
 */
export default defineEventHandler(async event => {
  if (!import.meta.dev) throw createError({ statusCode: 404, message: 'Non trovato' })
  const user = await requireUser(event)
  const requestId = requireUuidParam(event, 'requestId')
  const [request] = await useDb()
    .select({ userId: tables.signatureRequests.userId })
    .from(tables.signatureRequests)
    .where(eq(tables.signatureRequests.id, requestId))
    .limit(1)
  const code = devCodes.get(requestId)
  if (!request || (user.role !== 'admin' && request.userId !== user.id) || !code) {
    throw createError({ statusCode: 404, message: 'Nessun codice inviato per questa richiesta' })
  }
  return { code }
})
