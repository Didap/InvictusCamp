import type { RemindResult } from '#shared/types/documents'
import { remindRequests } from '~~/server/domain/signatures'

/** A reminder to one person who still has to sign (or read) a document. */
export default defineEventHandler(async (event): Promise<RemindResult> => {
  const admin = await requireAdmin(event)
  const requestId = requireUuidParam(event, 'id')
  const ctx = await emailContext()
  const messages = await useDb().transaction(tx =>
    remindRequests(tx, ctx, { requestId, actor: { userId: admin.id, ip: clientIp(event) } }),
  )
  const report = await deliver(messages)
  return { emails: messages.length - report.disabled }
})
