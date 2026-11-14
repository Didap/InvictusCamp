import { assignStaffLodging, sessionLodgingsOf } from '#server/domain/lodgings'
import { lodgingAssignmentSchema } from '#shared/schemas/lodgings'
import type { SessionLodgingsDto } from '#shared/types/lodgings'

/** Places a member of the session staff or v-team in a lodging, or takes them out; returns the tab. No email. */
export default defineEventHandler(async (event): Promise<SessionLodgingsDto> => {
  const admin = await requireAdmin(event)
  const sessionId = requireUuidParam(event, 'id')
  const convocationId = requireUuidParam(event, 'convocationId')
  const { lodgingId } = await parseBody(event, lodgingAssignmentSchema)
  await useDb().transaction(tx =>
    assignStaffLodging(tx, { sessionId, convocationId, lodgingId, actor: { userId: admin.id, ip: clientIp(event) } }),
  )
  return sessionLodgingsOf(useDb(), sessionId)
})
