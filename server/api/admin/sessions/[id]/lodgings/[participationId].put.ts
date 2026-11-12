import { assignLodging, sessionLodgingsOf } from '#server/domain/lodgings'
import { lodgingAssignmentSchema } from '#shared/schemas/lodgings'
import type { SessionLodgingsDto } from '#shared/types/lodgings'

/** Places a family of the session in a lodging, or takes it out; returns the tab as it is now. No email. */
export default defineEventHandler(async (event): Promise<SessionLodgingsDto> => {
  const admin = await requireAdmin(event)
  const sessionId = requireUuidParam(event, 'id')
  const participationId = requireUuidParam(event, 'participationId')
  const { lodgingId } = await parseBody(event, lodgingAssignmentSchema)
  await useDb().transaction(tx =>
    assignLodging(tx, { sessionId, participationId, lodgingId, actor: { userId: admin.id, ip: clientIp(event) } }),
  )
  return sessionLodgingsOf(useDb(), sessionId)
})
