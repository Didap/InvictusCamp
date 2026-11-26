import { openStaffResource } from '../../../domain/staff-resources'

/** The person's request for a resource to accept (spec 3.6). */
export default defineEventHandler(async event => {
  const { user } = await requireStaff(event)
  const documentId = requireUuidParam(event, 'id')
  const requestId = await useDb().transaction(tx => openStaffResource(tx, { userId: user.id, documentId }))
  return { requestId }
})
