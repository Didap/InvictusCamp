import { duplicateSession } from '#server/domain/sessions'
import type { SessionCreated } from '#shared/types/sessions'

/** A new draft with the same facts, without families and staff. */
export default defineEventHandler(async (event): Promise<SessionCreated> => {
  const admin = await requireAdmin(event)
  const sessionId = requireUuidParam(event, 'id')
  return useDb().transaction(tx =>
    duplicateSession(tx, { sessionId, actor: { userId: admin.id, ip: clientIp(event) } }),
  )
})
