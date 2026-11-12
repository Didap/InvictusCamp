import { lodgingsCsv } from '#server/domain/lodgings'

/** The layout of the session as a CSV file. The download is audited. */
export default defineEventHandler(async event => {
  const admin = await requireAdmin(event)
  const sessionId = requireUuidParam(event, 'id')
  const file = await lodgingsCsv(useDb(), sessionId)
  await audit(event, {
    actorUserId: admin.id,
    action: 'session.lodgings_export',
    entityType: 'session',
    entityId: sessionId,
  })
  return sendCsv(event, file)
})
