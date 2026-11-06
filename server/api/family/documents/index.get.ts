import type { PersonalDocumentDto } from '#shared/types/families'
import { listPersonalDocuments } from '../../../domain/families'

/** The personal documents of the signed-in family. */
export default defineEventHandler(async (event): Promise<PersonalDocumentDto[]> => {
  const { user } = await requireFamily(event)
  return listPersonalDocuments(useDb(), user.id)
})
