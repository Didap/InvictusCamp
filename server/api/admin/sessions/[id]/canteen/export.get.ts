import { canteenCsv } from '#server/domain/canteen'

/** The canteen summary as a CSV file for the supplier. The download is audited. */
export default defineEventHandler(async event => {
  const admin = await requireAdmin(event)
  const sessionId = requireUuidParam(event, 'id')
  const file = await canteenCsv(useDb(), sessionId)
  await audit(event, {
    actorUserId: admin.id,
    action: 'session.canteen_export',
    entityType: 'session',
    entityId: sessionId,
  })
  return sendCsv(event, file)
})
