import { sessionGroupsOf, setGroupLeader } from '#server/domain/activity-groups'
import { groupLeaderSchema } from '#shared/schemas/activity-groups'
import type { SessionGroupsDto } from '#shared/types/activity-groups'

/** Chooses who leads an activity group, or nobody; returns the tab as it is now. No email. */
export default defineEventHandler(async (event): Promise<SessionGroupsDto> => {
  const admin = await requireAdmin(event)
  const sessionId = requireUuidParam(event, 'id')
  const { group, convocationId } = await parseBody(event, groupLeaderSchema)
  await useDb().transaction(tx =>
    setGroupLeader(tx, { sessionId, group, convocationId, actor: { userId: admin.id, ip: clientIp(event) } }),
  )
  return sessionGroupsOf(useDb(), sessionId)
})
