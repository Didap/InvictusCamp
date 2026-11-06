import { staffDocumentSchema } from '#shared/schemas/staff'
import type { ApiIssue } from '#shared/types/api'

/** Uploads a personal document (PDF, JPG or PNG up to 15 MB) with its category and title. */
export default defineEventHandler(async event => {
  const { user } = await requireStaff(event)
  const upload = await readUpload(event)
  const parsed = staffDocumentSchema.safeParse(upload.fields)
  if (!parsed.success) {
    const issues: ApiIssue[] = parsed.error.issues.map(issue => ({
      path: issue.path.join('.'),
      message: issue.message,
    }))
    throw createError({ statusCode: 400, message: `Dati non validi: ${issues[0]?.message}`, data: { issues } })
  }
  const file = await saveFile({
    data: upload.data,
    originalName: upload.filename,
    mimeType: upload.mimeType,
    purpose: 'personal_document',
    ownerUserId: user.id,
    uploadedBy: user.id,
  })
  try {
    const [row] = await useDb()
      .insert(tables.personalDocuments)
      .values({
        userId: user.id,
        category: parsed.data.category,
        title: parsed.data.title,
        fileId: file.id,
        uploadedBy: user.id,
      })
      .returning({ id: tables.personalDocuments.id })
    return { id: row!.id }
  } catch (error) {
    await removeFile(file.id)
    throw error
  }
})
