import { groupsPdf } from '#server/domain/activity-groups'

/** The activity groups of the session as a PDF to print, downloaded. Audited like the CSV. */
export default defineEventHandler(async event => {
  const admin = await requireAdmin(event)
  const sessionId = requireUuidParam(event, 'id')
  const file = await groupsPdf(useDb(), sessionId)
  await audit(event, {
    actorUserId: admin.id,
    action: 'session.groups_export',
    entityType: 'session',
    entityId: sessionId,
    data: { format: 'pdf' },
  })
  return sendPdf(event, file)
})
