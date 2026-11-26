import { contactBulkSchema } from '#shared/schemas/contacts'
import { bulkContacts } from '../../../domain/contacts'

/** One action on the contacts ticked, or on every contact the filters find: group, type, delete. */
export default defineEventHandler(async event => {
  const admin = await requireAdmin(event)
  const input = await parseBody(event, contactBulkSchema)
  const count = await useDb().transaction(tx => bulkContacts(tx, input, { userId: admin.id, ip: clientIp(event) }))
  return { count }
})
