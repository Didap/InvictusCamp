import { contactInputSchema } from '#shared/schemas/contacts'
import { updateContact } from '../../../domain/contacts'

/** Changes a contact: type, names, email and groups. */
export default defineEventHandler(async event => {
  await requireAdmin(event)
  const id = requireUuidParam(event, 'id')
  const input = await parseBody(event, contactInputSchema)
  await useDb().transaction(tx => updateContact(tx, id, input))
  return { ok: true }
})
