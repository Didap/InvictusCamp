import { documentUploadFieldsSchema } from '#shared/schemas/documents'
import type { ApiIssue } from '#shared/types/api'
import { createDocument } from '~~/server/domain/signatures'

/** Uploads a PDF (multipart: `file` plus title, category, description, requiresSignature, sessionId). */
export default defineEventHandler(async (event): Promise<{ id: string }> => {
  const admin = await requireAdmin(event)
  const upload = await readUpload(event, { accept: ['application/pdf'] })
  const parsed = documentUploadFieldsSchema.safeParse(upload.fields)
  if (!parsed.success) {
    const issues: ApiIssue[] = parsed.error.issues.map(issue => ({
      path: issue.path.join('.'),
      message: issue.message,
    }))
    throw createError({ statusCode: 400, message: `Dati non validi: ${issues[0]?.message}`, data: { issues } })
  }
  const id = await useDb().transaction(tx =>
    createDocument(tx, uploadsDir(), {
      data: upload.data,
      filename: upload.filename,
      fields: parsed.data,
      actor: { userId: admin.id, ip: clientIp(event) },
    }),
  )
  return { id }
})
