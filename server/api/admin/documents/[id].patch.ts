import { documentUpdateSchema } from '#shared/schemas/documents'
import type { DocumentDetail } from '#shared/types/documents'
import { documentDetail, updateDocument } from '~~/server/domain/signatures'

/** Edits title, category, description, session and "da firmare" (the last only while nobody signed). */
export default defineEventHandler(async (event): Promise<DocumentDetail> => {
  const admin = await requireAdmin(event)
  const documentId = requireUuidParam(event, 'id')
  const fields = await parseBody(event, documentUpdateSchema)
  const db = useDb()
  await db.transaction(tx =>
    updateDocument(tx, { documentId, fields, actor: { userId: admin.id, ip: clientIp(event) } }),
  )
  return documentDetail(db, documentId)
})
