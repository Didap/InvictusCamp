import type { EmailQueueOverview } from '#shared/types/communications'
import { getEmailQueue } from '../../../domain/email-quota'

/** Today's emails against the daily limit, and the queue with its expected departures. */
export default defineEventHandler(async (event): Promise<EmailQueueOverview> => {
  await requireAdmin(event)
  return getEmailQueue(useDb())
})
