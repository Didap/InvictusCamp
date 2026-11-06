import type { DocumentOptions } from '#shared/types/documents'
import { documentOptions } from '~~/server/domain/signatures'

/** The choices of the upload and assign dialogs: sessions, people, documents in use. */
export default defineEventHandler(async (event): Promise<DocumentOptions> => {
  await requireAdmin(event)
  return documentOptions(useDb())
})
