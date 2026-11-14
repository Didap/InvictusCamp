import { feedbackYears } from '#server/domain/feedback'

/** The years with feedback (docs/spec.md 3.13), newest first: imported or from the questionnaire. */
export default defineEventHandler(async (event): Promise<number[]> => {
  await requireAdmin(event)
  return feedbackYears(useDb())
})
