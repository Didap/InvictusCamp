import { lodgingsCsv } from '#server/domain/lodgings'

/** The layout of the session as a CSV file. The download is audited. */
export default defineEventHandler(async event => {
  const admin = await requireAdmin(event)
  const sessionId = requireUuidParam(event, 'id')
  const { filename, csv } = await lodgingsCsv(useDb(), sessionId)
  await audit(event, {
    actorUserId: admin.id,
    action: 'session.lodgings_export',
    entityType: 'session',
    entityId: sessionId,
  })
  setResponseHeader(event, 'Content-Type', 'text/csv; charset=utf-8')
  setResponseHeader(event, 'Content-Disposition', `attachment; filename="${filename}"`)
  setResponseHeader(event, 'Cache-Control', 'no-store')
  return csv
})
