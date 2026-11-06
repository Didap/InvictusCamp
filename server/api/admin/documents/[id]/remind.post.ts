import type { RemindResult } from '#shared/types/documents'
import { remindRequests } from '~~/server/domain/signatures'

/** "Sollecita tutti": a reminder to everyone who still has to sign (or read) the document. */
export default defineEventHandler(async (event): Promise<RemindResult> => {
  const admin = await requireAdmin(event)
  const documentId = requireUuidParam(event, 'id')
  const messages = await useDb().transaction(tx =>
    remindRequests(tx, emailContext(), { documentId, actor: { userId: admin.id, ip: clientIp(event) } }),
  )
  await deliver(messages)
  return { emails: messages.length }
})
