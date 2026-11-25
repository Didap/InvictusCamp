import { PDF_ONLY_DOCUMENT_CATEGORIES, staffDocumentSchema } from '#shared/schemas/staff'

/** Uploads a personal document (PDF, JPG or PNG up to 15 MB; the ID in PDF) with its category and title. */
export default defineEventHandler(async event => {
  const { user } = await requireStaff(event)
  const upload = await readUpload(event)
  const input = parseFields(upload.fields, staffDocumentSchema)
  // The ID is one of the required documents: PDF only, like the CV (the same answer as readUpload).
  if (PDF_ONLY_DOCUMENT_CATEGORIES.includes(input.category) && upload.mimeType !== 'application/pdf') {
    throw createError({ statusCode: 415, message: 'Carica un file PDF' })
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
        category: input.category,
        title: input.title,
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
