import { personalDocumentSchema } from '#shared/schemas/families'
import { addPersonalDocument, assertPersonalDocument } from '../../../domain/families'

/**
 * The family uploads a personal document (multipart: `file` plus category, title and optionally the
 * member it refers to): PDF, JPG or PNG up to 15 MB, stored privately and owned by the family account.
 * Certificates and diagnoses need the consent to health data.
 */
export default defineEventHandler(async event => {
  const { user, family } = await requireFamily(event)
  const upload = await readUpload(event)
  const document = parseFields(upload.fields, personalDocumentSchema)
  const db = useDb()
  // Checked before the file is written, so a refused upload leaves nothing behind.
  await assertPersonalDocument(db, family.id, document)
  return db.transaction(async tx => {
    const file = await saveFile(
      {
        data: upload.data,
        originalName: upload.filename,
        mimeType: upload.mimeType,
        purpose: 'personal_document',
        ownerUserId: user.id,
        uploadedBy: user.id,
      },
      tx,
    )
    return addPersonalDocument(tx, {
      familyId: family.id,
      userId: user.id,
      document,
      fileId: file.id,
      uploadedBy: user.id,
    })
  })
})
