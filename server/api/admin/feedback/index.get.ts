import { desc } from 'drizzle-orm'

/** The years with feedback (docs/spec.md 3.13), newest first. */
export default defineEventHandler(async (event): Promise<number[]> => {
  await requireAdmin(event)
  const { feedbackArchives } = tables
  const rows = await useDb()
    .select({ year: feedbackArchives.year })
    .from(feedbackArchives)
    .orderBy(desc(feedbackArchives.year))
  return rows.map(row => row.year)
})
