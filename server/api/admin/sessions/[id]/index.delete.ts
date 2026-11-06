import { deleteSession } from '#server/domain/sessions'

/** Deletes a draft without families and staff. */
export default defineEventHandler(async event => {
  const admin = await requireAdmin(event)
  const sessionId = requireUuidParam(event, 'id')
  await useDb().transaction(tx => deleteSession(tx, { sessionId, actor: { userId: admin.id, ip: clientIp(event) } }))
  return { ok: true }
})
