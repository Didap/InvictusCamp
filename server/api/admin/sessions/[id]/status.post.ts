import { transitionSession } from '#server/domain/sessions'
import { sessionTransitionSchema } from '#shared/schemas/sessions'
import type { SessionTransitionResult } from '#shared/types/sessions'

/** Moves the session to another status (spec 3.2) and sends the families' and staff's emails after the commit. */
export default defineEventHandler(async (event): Promise<SessionTransitionResult> => {
  const admin = await requireAdmin(event)
  const sessionId = requireUuidParam(event, 'id')
  const { to } = await parseBody(event, sessionTransitionSchema)
  const ctx = await emailContext()
  const result = await useDb().transaction(tx =>
    transitionSession(tx, ctx, { sessionId, to, actor: { userId: admin.id, ip: clientIp(event) } }),
  )
  const report = await deliver(result.emails)
  return { from: result.from, to: result.to, emails: result.emails.length - report.disabled }
})
