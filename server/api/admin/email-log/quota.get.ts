import type { EmailQuotaSummary } from '#shared/types/communications'
import { getEmailQuota } from '../../../domain/email-quota'

/** Today's emails against the daily limit and the expected departures of the queue. */
export default defineEventHandler(async (event): Promise<EmailQuotaSummary> => {
  await requireAdmin(event)
  return getEmailQuota(useDb())
})
