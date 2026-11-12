import { participantsCsv } from '#server/domain/sessions'

/** The families of the session as a CSV file (no health details). The download is audited. */
export default defineEventHandler(async event => {
  const admin = await requireAdmin(event)
  const sessionId = requireUuidParam(event, 'id')
  const file = await participantsCsv(useDb(), sessionId)
  await audit(event, { actorUserId: admin.id, action: 'session.export', entityType: 'session', entityId: sessionId })
  return sendCsv(event, file)
})
