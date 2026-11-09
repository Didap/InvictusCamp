import type { DocumentDetail } from '#shared/types/documents'
import { documentDetail } from '~~/server/domain/signatures'

/** A document with its file and every request. */
export default defineEventHandler(async (event): Promise<DocumentDetail> => {
  await requireAdmin(event)
  return documentDetail(useDb(), requireUuidParam(event, 'id'))
})
