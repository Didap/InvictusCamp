import { deleteStaffLabel } from '../../../../domain/staff-labels'

/** Deletes a tag and takes it away from everyone. */
export default defineEventHandler(async event => {
  const admin = await requireAdmin(event)
  const id = requireUuidParam(event, 'id')
  await useDb().transaction(tx => deleteStaffLabel(tx, 'tag', id, { userId: admin.id, ip: clientIp(event) }))
  return { ok: true }
})
