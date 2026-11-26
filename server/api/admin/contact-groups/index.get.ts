import type { ContactGroupItem } from '#shared/types/contacts'
import { listContactGroups } from '../../../domain/contacts'

/** The groups of the «Anagrafica», with how many contacts each has. */
export default defineEventHandler(async (event): Promise<ContactGroupItem[]> => {
  await requireAdmin(event)
  return listContactGroups(useDb())
})
