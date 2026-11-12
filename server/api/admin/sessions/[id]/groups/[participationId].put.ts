import { assignGroup, sessionGroupsOf } from '#server/domain/activity-groups'
import { groupAssignmentSchema } from '#shared/schemas/activity-groups'
import type { SessionGroupsDto } from '#shared/types/activity-groups'

/** Puts a family of the session in an activity group, or takes it out; returns the tab as it is now. No email. */
export default defineEventHandler(async (event): Promise<SessionGroupsDto> => {
  const admin = await requireAdmin(event)
  const sessionId = requireUuidParam(event, 'id')
  const participationId = requireUuidParam(event, 'participationId')
  const { group } = await parseBody(event, groupAssignmentSchema)
  await useDb().transaction(tx =>
    assignGroup(tx, { sessionId, participationId, group, actor: { userId: admin.id, ip: clientIp(event) } }),
  )
  return sessionGroupsOf(useDb(), sessionId)
})
