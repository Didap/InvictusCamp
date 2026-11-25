import { replaceCv, toFileDto } from '../../../domain/staff'

/**
 * The CV (PDF only) of an account that has none yet: it sends the application (spec 3.4). The previous
 * CV, if any, is deleted.
 */
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
    replaced = await useDb().transaction(tx => replaceCv(tx, user.id, file.id, { ip: clientIp(event) }))
  } catch (error) {
    await removeFile(file.id)
    throw error
  }
  if (replaced) await removeFile(replaced)
  return toFileDto(file)
})
