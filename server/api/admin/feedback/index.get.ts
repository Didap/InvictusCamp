import { desc } from 'drizzle-orm'
import type { FeedbackYear } from '#shared/types/feedback'

/** The years with feedback (docs/spec.md 3.13), newest first. */
export default defineEventHandler(async (event): Promise<FeedbackYear[]> => {
  await requireAdmin(event)
  const { feedbackArchives } = tables
  const rows = await useDb()
    .select({ year: feedbackArchives.year, source: feedbackArchives.source, importedAt: feedbackArchives.importedAt })
    .from(feedbackArchives)
    .orderBy(desc(feedbackArchives.year))
  return rows.map(row => ({ ...row, importedAt: row.importedAt.toISOString() }))
})
