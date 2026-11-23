import type { EmailQuotaStatus } from '#shared/types/communications'
import { getEmailQuota } from '../../../domain/email-quota'

/** Today's emails against the daily limit, the expected departures, and whether emails really leave. */
export default defineEventHandler(async (event): Promise<EmailQuotaStatus> => {
  await requireAdmin(event)
  return { ...(await getEmailQuota(useDb())), simulated: !useRuntimeConfig().resendApiKey }
})
