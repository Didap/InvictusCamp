import { staffRoleInputSchema } from '#shared/schemas/staff'
import { renameStaffRole } from '../../../../domain/staff-labels'

/** Renames a role: people and convocations that have it show the new name. */
export default defineEventHandler(async event => {
  const admin = await requireAdmin(event)
  // Text ids (`coordinator` or a uuid): one that does not exist is a 404 of the domain.
  const id = getRouterParam(event, 'id')!
  const input = await parseBody(event, staffRoleInputSchema)
  await useDb().transaction(tx => renameStaffRole(tx, id, input, { userId: admin.id, ip: clientIp(event) }))
  return { ok: true }
})
