import { documentUploadFieldsSchema } from '#shared/schemas/documents'
import { createDocument } from '~~/server/domain/signatures'

/** Uploads a PDF (multipart: `file` plus title, category, description, requiresSignature, sessionId). */
export default defineEventHandler(async (event): Promise<{ id: string }> => {
  const admin = await requireAdmin(event)
  const upload = await readUpload(event, { accept: ['application/pdf'] })
  const fields = parseFields(upload.fields, documentUploadFieldsSchema)
  const id = await useDb().transaction(tx =>
    createDocument(tx, uploadsDir(), {
      data: upload.data,
      filename: upload.filename,
      fields,
      actor: { userId: admin.id, ip: clientIp(event) },
    }),
  )
  return { id }
})
