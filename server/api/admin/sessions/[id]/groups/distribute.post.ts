import { distributeGroups, sessionGroupsOf } from '#server/domain/activity-groups'
import type { SessionGroupsDto } from '#shared/types/activity-groups'

/** Puts the families without a group into the groups, keeping them even; returns the tab. No email. */
export default defineEventHandler(async (event): Promise<SessionGroupsDto & { placed: number }> => {
  const admin = await requireAdmin(event)
  const sessionId = requireUuidParam(event, 'id')
  const placed = await useDb().transaction(tx =>
    distributeGroups(tx, { sessionId, actor: { userId: admin.id, ip: clientIp(event) } }),
  )
  return { ...(await sessionGroupsOf(useDb(), sessionId)), placed }
})
