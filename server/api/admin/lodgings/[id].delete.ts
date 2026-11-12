import { deleteLodging } from '../../../domain/lodgings'

/**
 * Deletes a lodging; the families placed in it in an open session are left without one. Refused when a
 * completed session has it in its layout.
 */
export default defineEventHandler(async event => {
  const admin = await requireAdmin(event)
  const id = requireUuidParam(event, 'id')
  await useDb().transaction(tx => deleteLodging(tx, id, { userId: admin.id, ip: clientIp(event) }))
  return { ok: true }
})
