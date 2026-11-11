import { audienceRequestSchema, describeAudience } from '#shared/schemas/communications'
import type { AudienceSummary } from '#shared/types/communications'
import { fullName } from '#shared/utils/format'
import { audienceSessionTitle, resolveAudience } from '../../../domain/audiences'

/** Who a message would reach, while the administration writes it (the composer's live count). */
export default defineEventHandler(async (event): Promise<AudienceSummary> => {
  await requireAdmin(event)
  const { audience } = await parseBody(event, audienceRequestSchema)
  const db = useDb()
  const [{ recipients, excluded }, sessionTitle] = await Promise.all([
    resolveAudience(db, audience),
    audienceSessionTitle(db, audience),
  ])
  return {
    label: describeAudience(audience, sessionTitle),
    count: recipients.length,
    excluded,
    recipients: recipients.map(r => ({
      userId: r.userId,
      firstName: r.firstName,
      name: fullName(r),
      email: r.email,
      role: r.role,
    })),
  }
})
