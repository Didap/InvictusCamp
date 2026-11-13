import { feedbackYear } from '#server/domain/feedback'
import { feedbackYearParamsSchema } from '#shared/schemas/feedback'
import type { FeedbackArchive } from '#shared/types/feedback'

/** A year of feedback whole (docs/spec.md 3.13): administration only, the staff part has names. */
export default defineEventHandler(async (event): Promise<FeedbackArchive> => {
  await requireAdmin(event)
  const { year } = parseParams(event, feedbackYearParamsSchema)
  return feedbackYear(useDb(), year)
})
