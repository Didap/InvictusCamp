import { deleteStaffLabel } from '../../../../domain/staff-labels'

/** Deletes a role and takes it away from everyone; the coordinator stays. */
export default defineEventHandler(async event => {
  const admin = await requireAdmin(event)
  // Text ids (`coordinator` or a uuid): one that does not exist is a 404 of the domain.
  const id = getRouterParam(event, 'id')!
  await useDb().transaction(tx => deleteStaffLabel(tx, 'role', id, { userId: admin.id, ip: clientIp(event) }))
  return { ok: true }
})
