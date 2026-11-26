import { resendInvitation } from '#server/domain/sessions'
import type { ParticipationActionResult } from '#shared/types/sessions'

/** Sends the invitation again to a family that has not answered yet. */
export default defineEventHandler(async (event): Promise<ParticipationActionResult> => {
  const admin = await requireAdmin(event)
  const sessionId = requireUuidParam(event, 'id')
  const participationId = requireUuidParam(event, 'participationId')
  const ctx = await emailContext()
  const result = await useDb().transaction(tx =>
    resendInvitation(tx, ctx, {
      sessionId,
      participationId,
      actor: { userId: admin.id, ip: clientIp(event) },
    }),
  )
  const report = await deliver(result.emails)
  return { emails: result.emails.length - report.disabled }
})
