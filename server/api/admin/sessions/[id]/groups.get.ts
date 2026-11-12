import { sessionGroupsOf } from '#server/domain/activity-groups'
import type { SessionGroupsDto } from '#shared/types/activity-groups'

/** The families holding a place with their activity group, and who can lead a group. No health details. */
export default defineEventHandler(async (event): Promise<SessionGroupsDto> => {
  await requireAdmin(event)
  return sessionGroupsOf(useDb(), requireUuidParam(event, 'id'))
})
