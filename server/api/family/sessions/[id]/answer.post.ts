import { answerInvitation } from '#server/domain/sessions'
import { answerSchema } from '#shared/schemas/sessions'

/** The family answers its own invitation: Conferma or Rinuncia with an optional reason. */
export default defineEventHandler(async event => {
  const { user, family } = await requireFamily(event)
  const participationId = requireUuidParam(event, 'id')
  const { answer, reason } = await parseBody(event, answerSchema)
  const result = await useDb().transaction(tx =>
    answerInvitation(tx, {
      participationId,
      answer,
      reason,
      by: 'family',
      familyId: family.id,
      actor: { userId: user.id, ip: clientIp(event) },
    }),
  )
  await deliver(result.emails)
  return { status: result.status }
})
