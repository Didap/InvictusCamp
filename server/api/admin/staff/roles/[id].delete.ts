import { deleteStaffLabel } from '../../../../domain/staff-labels'

/** Deletes a role and takes it away from everyone; the coordinator stays. */
export default defineEventHandler(async event => {
  const admin = await requireAdmin(event)
  const id = requireLabelParam(event)
  await useDb().transaction(tx => deleteStaffLabel(tx, 'role', id, { userId: admin.id, ip: clientIp(event) }))
  return { ok: true }
})
