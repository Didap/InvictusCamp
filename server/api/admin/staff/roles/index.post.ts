import { staffRoleInputSchema } from '#shared/schemas/staff'
import { createStaffRole } from '../../../../domain/staff-labels'

/** A new role of staff and v-team (spec 3.4). */
export default defineEventHandler(async event => {
  const admin = await requireAdmin(event)
  const input = await parseBody(event, staffRoleInputSchema)
  const id = await useDb().transaction(tx => createStaffRole(tx, input, { userId: admin.id, ip: clientIp(event) }))
  return { id }
})
