import { contactInputSchema } from '#shared/schemas/contacts'
import { createContact } from '../../../domain/contacts'

/** One contact added by hand. */
export default defineEventHandler(async event => {
  const admin = await requireAdmin(event)
  const input = await parseBody(event, contactInputSchema)
  const id = await useDb().transaction(tx => createContact(tx, input, { userId: admin.id, ip: clientIp(event) }))
  return { id }
})
