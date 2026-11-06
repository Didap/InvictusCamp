import { createSession } from '#server/domain/sessions'
import { sessionSchema } from '#shared/schemas/sessions'
import type { SessionCreated } from '#shared/types/sessions'

/** A new session, always a draft. */
export default defineEventHandler(async (event): Promise<SessionCreated> => {
  const admin = await requireAdmin(event)
  const values = await parseBody(event, sessionSchema)
  return useDb().transaction(tx => createSession(tx, { values, actor: { userId: admin.id, ip: clientIp(event) } }))
})
