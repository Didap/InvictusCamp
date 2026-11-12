import { groupsCsv } from '#server/domain/activity-groups'

/** The activity groups of the session as a CSV file. The download is audited. */
export default defineEventHandler(async event => {
  const admin = await requireAdmin(event)
  const sessionId = requireUuidParam(event, 'id')
  const file = await groupsCsv(useDb(), sessionId)
  await audit(event, {
    actorUserId: admin.id,
    action: 'session.groups_export',
    entityType: 'session',
    entityId: sessionId,
  })
  return sendCsv(event, file)
})
