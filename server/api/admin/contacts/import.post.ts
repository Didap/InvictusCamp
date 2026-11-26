import { contactImportSchema } from '#shared/schemas/contacts'
import type { ContactImportResult } from '#shared/types/contacts'
import { importContacts } from '../../../domain/contacts'

/** A list of contacts pasted or loaded from a CSV, read in the browser (spec 3.16). */
export default defineEventHandler(async (event): Promise<ContactImportResult> => {
  const admin = await requireAdmin(event)
  const input = await parseBody(event, contactImportSchema)
  return useDb().transaction(tx => importContacts(tx, input, { userId: admin.id, ip: clientIp(event) }))
})
