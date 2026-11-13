import { submitFeedback } from '#server/domain/feedback'
import { feedbackAnswerSchema } from '#shared/schemas/feedback'

/** The family sends its answers to the questionnaire, once (docs/spec.md 3.13). */
export default defineEventHandler(async event => {
  const { user, family } = await requireFamily(event)
  const sessionId = requireUuidParam(event, 'sessionId')
  const values = await parseBody(event, feedbackAnswerSchema)
  await useDb().transaction(tx =>
    submitFeedback(tx, { familyId: family.id, sessionId, values, actor: { userId: user.id, ip: clientIp(event) } }),
  )
  return { ok: true }
})
