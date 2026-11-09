import { reorderReserves } from '#server/domain/sessions'
import { reorderReservesSchema } from '#shared/schemas/sessions'

/** New calling order of the waiting reserves ("Sposta su", "Sposta giù"). No email leaves. */
export default defineEventHandler(async event => {
  const admin = await requireAdmin(event)
  const sessionId = requireUuidParam(event, 'id')
  const { order } = await parseBody(event, reorderReservesSchema)
  await useDb().transaction(tx =>
    reorderReserves(tx, { sessionId, order, actor: { userId: admin.id, ip: clientIp(event) } }),
  )
  return { ok: true }
})
