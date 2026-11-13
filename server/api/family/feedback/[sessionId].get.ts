import { familyFeedbackForm } from '#server/domain/feedback'
import type { FamilyFeedbackForm } from '#shared/types/feedback'

/** The end-of-session questionnaire of a completed session the family took part in (docs/spec.md 3.13). */
export default defineEventHandler(async (event): Promise<FamilyFeedbackForm> => {
  const { family } = await requireFamily(event)
  return familyFeedbackForm(useDb(), { familyId: family.id, sessionId: requireUuidParam(event, 'sessionId') })
})
