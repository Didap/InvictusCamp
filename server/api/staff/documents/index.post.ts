import { staffDocumentSchema, staffDocumentTypes } from '#shared/schemas/staff'

/** Uploads a personal document (PDF, JPG or PNG up to 15 MB; CV and ID in PDF) with its category and title. */
export default defineEventHandler(async event => {
  const { user } = await requireStaff(event)
  const upload = await readUpload(event)
  const input = parseFields(upload.fields, staffDocumentSchema)
  // The required documents (CV, ID) only in PDF.
  const accept = staffDocumentTypes(input.category)
  if (!accept.includes(upload.mimeType)) throw unsupportedType(accept)
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
