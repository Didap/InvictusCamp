import type { DocumentDetail } from '#shared/types/documents'
import { documentDetail, removeReplacedFile, replaceDocumentFile } from '~~/server/domain/signatures'

/** Replaces the PDF of a document nobody has signed or read yet (multipart, field `file`). */
export default defineEventHandler(async (event): Promise<DocumentDetail> => {
  const admin = await requireAdmin(event)
  const documentId = requireUuidParam(event, 'id')
  const upload = await readUpload(event, { accept: ['application/pdf'] })
  const db = useDb()
  const { oldFileId } = await db.transaction(tx =>
    replaceDocumentFile(tx, uploadsDir(), {
      documentId,
      data: upload.data,
      filename: upload.filename,
      actor: { userId: admin.id, ip: clientIp(event) },
    }),
  )
  await removeReplacedFile(db, uploadsDir(), oldFileId).catch(() => {})
  return documentDetail(db, documentId)
})
