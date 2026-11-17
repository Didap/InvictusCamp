import { canteenPdf } from '#server/domain/canteen'

/** The canteen summary as a PDF for the supplier, downloaded. Audited like the CSV. */
export default defineEventHandler(async event => {
  const admin = await requireAdmin(event)
  const sessionId = requireUuidParam(event, 'id')
  const file = await canteenPdf(useDb(), sessionId)
  await audit(event, {
    actorUserId: admin.id,
    action: 'session.canteen_export',
    entityType: 'session',
    entityId: sessionId,
    data: { format: 'pdf' },
  })
  return sendPdf(event, file)
})
