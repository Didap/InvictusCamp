import { contactGroupInputSchema } from '#shared/schemas/contacts'
import { createContactGroup } from '../../../domain/contacts'

/** A new group of contacts. */
export default defineEventHandler(async event => {
  const admin = await requireAdmin(event)
  const input = await parseBody(event, contactGroupInputSchema)
  const id = await useDb().transaction(tx => createContactGroup(tx, input, { userId: admin.id, ip: clientIp(event) }))
  return { id }
})
