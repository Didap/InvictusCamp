import { staffTagInputSchema } from '#shared/schemas/staff'
import { createStaffTag } from '../../../../domain/staff-labels'

/** A new tag of the «Valutazione» (spec 3.4). */
export default defineEventHandler(async event => {
  const admin = await requireAdmin(event)
  const input = await parseBody(event, staffTagInputSchema)
  const id = await useDb().transaction(tx => createStaffTag(tx, input, { userId: admin.id, ip: clientIp(event) }))
  return { id }
})
