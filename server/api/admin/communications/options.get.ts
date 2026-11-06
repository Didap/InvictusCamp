import { desc } from 'drizzle-orm'
import type { CommunicationOptions } from '#shared/types/communications'

/** What the composer offers: every session, the most recent first. */
export default defineEventHandler(async (event): Promise<CommunicationOptions> => {
  await requireAdmin(event)
  const { campSessions } = tables
  const sessions = await useDb()
    .select({
      id: campSessions.id,
      title: campSessions.title,
      startDate: campSessions.startDate,
      endDate: campSessions.endDate,
      status: campSessions.status,
    })
    .from(campSessions)
    .orderBy(desc(campSessions.startDate))
  return { sessions }
})
