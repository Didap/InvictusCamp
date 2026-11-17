import { staffTagInputSchema } from '#shared/schemas/staff'
import { updateStaffTag } from '../../../../domain/staff-labels'

/** Renames a tag or changes its colour. */
export default defineEventHandler(async event => {
  const admin = await requireAdmin(event)
  const id = requireUuidParam(event, 'id')
  const input = await parseBody(event, staffTagInputSchema)
  await useDb().transaction(tx => updateStaffTag(tx, id, input, { userId: admin.id, ip: clientIp(event) }))
  return { ok: true }
})
