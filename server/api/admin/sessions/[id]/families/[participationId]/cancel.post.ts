import { cancelParticipation } from '#server/domain/sessions'
import type { ParticipationActionResult } from '#shared/types/sessions'

/** Removes a family from the session (session.removed if it had been invited). */
export default defineEventHandler(async (event): Promise<ParticipationActionResult> => {
  const admin = await requireAdmin(event)
  const sessionId = requireUuidParam(event, 'id')
  const participationId = requireUuidParam(event, 'participationId')
  const result = await useDb().transaction(tx =>
    cancelParticipation(tx, emailContext(), {
      sessionId,
      participationId,
      actor: { userId: admin.id, ip: clientIp(event) },
    }),
  )
  await deliver(result.emails)
  return { emails: result.emails.length }
})
