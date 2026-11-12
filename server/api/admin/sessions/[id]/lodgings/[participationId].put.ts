import { assignLodging } from '#server/domain/lodgings'
import { lodgingAssignmentSchema } from '#shared/schemas/lodgings'

/** Places a family of the session in a lodging, or takes it out. No email. */
export default defineEventHandler(async event => {
  const admin = await requireAdmin(event)
  const sessionId = requireUuidParam(event, 'id')
  const participationId = requireUuidParam(event, 'participationId')
  const { lodgingId } = await parseBody(event, lodgingAssignmentSchema)
  await useDb().transaction(tx =>
    assignLodging(tx, { sessionId, participationId, lodgingId, actor: { userId: admin.id, ip: clientIp(event) } }),
  )
  return { ok: true }
})
