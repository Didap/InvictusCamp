import { openStaffResource } from '../../../domain/staff-resources'

/** «Leggi e accetta»: the person's request for a resource to accept, made now if missing (no email). */
export default defineEventHandler(async event => {
  const { user } = await requireStaff(event)
  const documentId = requireUuidParam(event, 'id')
  const requestId = await useDb().transaction(tx => openStaffResource(tx, { userId: user.id, documentId }))
  return { requestId }
})
