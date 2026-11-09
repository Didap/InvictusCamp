import { documentListQuerySchema } from '#shared/schemas/documents'
import type { DocumentListItem } from '#shared/types/documents'
import { listDocuments } from '~~/server/domain/signatures'

/** Every document with its progress; ?sessionId= the documents of one session (its requests only). */
export default defineEventHandler(async (event): Promise<DocumentListItem[]> => {
  await requireAdmin(event)
  const query = parseQuery(event, documentListQuerySchema)
  return listDocuments(useDb(), { sessionId: query.sessionId })
})
