import { callReserve } from '#server/domain/sessions'
import { callReserveSchema } from '#shared/schemas/sessions'
import type { ParticipationActionResult } from '#shared/types/sessions'

/** "Chiama la riserva": the next waiting reserve, or the chosen one, takes the free place. */
export default defineEventHandler(async (event): Promise<ParticipationActionResult> => {
  const admin = await requireAdmin(event)
  const sessionId = requireUuidParam(event, 'id')
  const { participationId } = await parseBody(event, callReserveSchema)
  const result = await useDb().transaction(tx =>
    callReserve(tx, emailContext(), { sessionId, participationId, actor: { userId: admin.id, ip: clientIp(event) } }),
  )
  await deliver(result.emails)
  return { emails: result.emails.length }
})
