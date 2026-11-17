import { lodgingsPdf } from '#server/domain/lodgings'

/** The layout of the session as a PDF, with the families' phones. Audited like the CSV. */
export default defineEventHandler(async event => {
  const admin = await requireAdmin(event)
  const sessionId = requireUuidParam(event, 'id')
  const file = await lodgingsPdf(useDb(), sessionId)
  await audit(event, {
    actorUserId: admin.id,
    action: 'session.lodgings_export',
    entityType: 'session',
    entityId: sessionId,
    data: { format: 'pdf' },
  })
  return sendPdf(event, file)
})
