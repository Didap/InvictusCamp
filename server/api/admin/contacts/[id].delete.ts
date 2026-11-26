import { deleteContact } from '../../../domain/contacts'

/** Deletes a contact from the registry (an account with the same email stays). */
export default defineEventHandler(async event => {
  const admin = await requireAdmin(event)
  const id = requireUuidParam(event, 'id')
  await useDb().transaction(tx => deleteContact(tx, id, { userId: admin.id, ip: clientIp(event) }))
  return { ok: true }
})
