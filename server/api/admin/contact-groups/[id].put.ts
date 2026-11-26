import { contactGroupInputSchema } from '#shared/schemas/contacts'
import { renameContactGroup } from '../../../domain/contacts'

/** Renames a group. */
export default defineEventHandler(async event => {
  const admin = await requireAdmin(event)
  const id = requireUuidParam(event, 'id')
  const input = await parseBody(event, contactGroupInputSchema)
  await useDb().transaction(tx => renameContactGroup(tx, id, input, { userId: admin.id, ip: clientIp(event) }))
  return { ok: true }
})
