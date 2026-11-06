import { answerInvitation } from '#server/domain/sessions'
import { answerSchema } from '#shared/schemas/sessions'
import type { ParticipationActionResult } from '#shared/types/sessions'

/** Records an answer the family gave by phone (audit participation.answer_by_admin). No email leaves. */
export default defineEventHandler(async (event): Promise<ParticipationActionResult> => {
  const admin = await requireAdmin(event)
  const sessionId = requireUuidParam(event, 'id')
  const participationId = requireUuidParam(event, 'participationId')
  const { answer, reason } = await parseBody(event, answerSchema)
  const result = await useDb().transaction(tx =>
    answerInvitation(tx, {
      participationId,
      sessionId,
      answer,
      reason,
      by: 'admin',
      actor: { userId: admin.id, ip: clientIp(event) },
    }),
  )
  await deliver(result.emails)
  return { emails: result.emails.length }
})
