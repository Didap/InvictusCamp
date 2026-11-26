import { deleteContactGroup } from '../../../domain/contacts'

/** Deletes a group; its contacts stay in the registry. */
export default defineEventHandler(async event => {
  const admin = await requireAdmin(event)
  const id = requireUuidParam(event, 'id')
  await useDb().transaction(tx => deleteContactGroup(tx, id, { userId: admin.id, ip: clientIp(event) }))
  return { ok: true }
})
