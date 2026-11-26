import { contactListQuery } from '#shared/schemas/contacts'
import type { Paginated } from '#shared/types/api'
import type { ContactListItem } from '#shared/types/contacts'
import { listContacts } from '../../../domain/contacts'

/** The «Anagrafica», a page at a time: search by name or email, filter by type and group (spec 3.16). */
export default defineEventHandler(async (event): Promise<Paginated<ContactListItem>> => {
  await requireAdmin(event)
  return listContacts(useDb(), parseQuery(event, contactListQuery))
})
