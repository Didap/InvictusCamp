import { replaceCv, toFileDto } from '../../../domain/staff'

/** Uploads the CV (PDF only) while the application is open; the previous CV is deleted. */
export default defineEventHandler(async event => {
  const { user, profile } = await requireStaff(event)
  if (profile.status !== 'registered') {
    throw createError({ statusCode: 409, message: 'La candidatura è già stata inviata: il CV non si può più cambiare' })
  }
  const upload = await readUpload(event, { accept: ['application/pdf'] })
  const file = await saveFile({
    data: upload.data,
    originalName: upload.filename,
    mimeType: upload.mimeType,
    purpose: 'cv',
    ownerUserId: user.id,
    uploadedBy: user.id,
  })
  let replaced: string | null
  try {
    replaced = await useDb().transaction(tx => replaceCv(tx, user.id, file.id))
  } catch (error) {
    await removeFile(file.id)
    throw error
  }
  if (replaced) await removeFile(replaced)
  return toFileDto(file)
})
