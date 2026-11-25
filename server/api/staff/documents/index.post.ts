import { staffDocumentSchema } from '#shared/schemas/staff'

/** Uploads a personal document (PDF, JPG or PNG up to 15 MB; the ID in PDF) with its category and title. */
export default defineEventHandler(async event => {
  const { user } = await requireStaff(event)
  const upload = await readUpload(event)
  const input = parseFields(upload.fields, staffDocumentSchema)
  // The ID is one of the required documents: PDF only, like the CV.
  if (input.category === 'id_document' && upload.mimeType !== 'application/pdf') {
    throw createError({ statusCode: 400, message: 'Il documento d’identità va caricato in PDF' })
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
