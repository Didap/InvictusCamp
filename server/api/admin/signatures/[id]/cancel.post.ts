import { cancelRequest } from '~~/server/domain/signatures'

/** Cancels a request still to sign: the person can no longer sign it. No email leaves. */
export default defineEventHandler(async (event): Promise<{ ok: true }> => {
  const admin = await requireAdmin(event)
  const requestId = requireUuidParam(event, 'id')
  await useDb().transaction(tx => cancelRequest(tx, { requestId, actor: { userId: admin.id, ip: clientIp(event) } }))
  return { ok: true }
})
