import { and, eq } from 'drizzle-orm'

/** Deletes one of the person's own personal documents (the file goes with it). */
export default defineEventHandler(async event => {
  const { user } = await requireStaff(event)
  const id = requireUuidParam(event, 'id')
  const { personalDocuments } = tables
  const [document] = await useDb()
    .select({ fileId: personalDocuments.fileId })
    .from(personalDocuments)
    .where(and(eq(personalDocuments.id, id), eq(personalDocuments.userId, user.id)))
    .limit(1)
  if (!document) throw createError({ statusCode: 404, message: 'Documento non trovato' })
  // The row goes with its file (personal_documents.file_id cascades).
  await removeFile(document.fileId)
  return { ok: true }
})
