import { applyWithCv, toFileDto } from '../../../domain/staff'

const ALREADY_SENT = 'La candidatura è già stata inviata: il CV non si può più cambiare'

/**
 * The CV (PDF only) of an account that has none yet, made before the CV was asked at registration or
 * invited: it sends the application (spec 3.4).
 */
export default defineEventHandler(async event => {
  const { user, profile } = await requireStaff(event, 'candidate')
  if (profile.status !== 'registered') throw createError({ statusCode: 409, message: ALREADY_SENT })
  const upload = await readUpload(event, { accept: ['application/pdf'] })
  const file = await saveFile({
    data: upload.data,
    originalName: upload.filename,
    mimeType: upload.mimeType,
    purpose: 'cv',
    ownerUserId: user.id,
    uploadedBy: user.id,
  })
  let sent: boolean
  try {
    sent = await useDb().transaction(tx => applyWithCv(tx, user.id, { ip: clientIp(event) }, file.id))
  } catch (error) {
    await removeFile(file.id)
    throw error
  }
  // Sent meanwhile from another tab.
  if (!sent) {
    await removeFile(file.id)
    throw createError({ statusCode: 409, message: ALREADY_SENT })
  }
  return toFileDto(file)
})
