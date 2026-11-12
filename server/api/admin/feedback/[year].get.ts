import { eq } from 'drizzle-orm'
import { feedbackYearParamsSchema } from '#shared/schemas/feedback'
import type { FeedbackArchive } from '#shared/types/feedback'

/** A year of feedback whole (docs/spec.md 3.13): administration only, the staff part has names. */
export default defineEventHandler(async (event): Promise<FeedbackArchive> => {
  await requireAdmin(event)
  const { year } = parseParams(event, feedbackYearParamsSchema)
  const { feedbackArchives } = tables
  const [row] = await useDb()
    .select({ data: feedbackArchives.data })
    .from(feedbackArchives)
    .where(eq(feedbackArchives.year, year))
  if (!row) throw createError({ statusCode: 404, message: `Nessun feedback per il ${year}` })
  return row.data
})
