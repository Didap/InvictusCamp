import { transitionSession } from '#server/domain/sessions'
import { sessionTransitionSchema } from '#shared/schemas/sessions'
import type { SessionTransitionResult } from '#shared/types/sessions'

/** Moves the session to another status (spec 3.2) and sends the families' emails after the commit. */
export default defineEventHandler(async (event): Promise<SessionTransitionResult> => {
  const admin = await requireAdmin(event)
  const sessionId = requireUuidParam(event, 'id')
  const { to } = await parseBody(event, sessionTransitionSchema)
  const result = await useDb().transaction(tx =>
    transitionSession(tx, emailContext(), { sessionId, to, actor: { userId: admin.id, ip: clientIp(event) } }),
  )
  await deliver(result.emails)
  return { from: result.from, to: result.to, emails: result.emails.length }
})
