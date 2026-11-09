import { getSessionDetail, updateSession } from '#server/domain/sessions'
import { sessionSchema } from '#shared/schemas/sessions'
import type { SessionDetail } from '#shared/types/sessions'

/** Edits a session while it is a draft, inviting or confirmed. No email leaves. */
export default defineEventHandler(async (event): Promise<SessionDetail> => {
  const admin = await requireAdmin(event)
  const sessionId = requireUuidParam(event, 'id')
  const values = await parseBody(event, sessionSchema)
  await useDb().transaction(tx =>
    updateSession(tx, { sessionId, values, actor: { userId: admin.id, ip: clientIp(event) } }),
  )
  return getSessionDetail(useDb(), sessionId)
})
