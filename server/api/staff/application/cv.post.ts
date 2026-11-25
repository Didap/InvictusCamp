import { applyWithCv, toFileDto } from '../../../domain/staff'

const ALREADY_SENT = 'La candidatura è già stata inviata: il CV non si può più cambiare'

/**
 * The CV (PDF only) of an account that has none yet, made before the CV was asked at registration or
 * invited: it sends the application (spec 3.4).
 */
export default defineEventHandler(async event => {
  const { user, profile } = await requireStaff(event, 'candidate')
  if (profile.status !== 'registered') throw createError({ statusCode: 409, message: ALREADY_SENT })
  // Refused when sent meanwhile from another tab.
  const file = await uploadCv(
    event,
    user.id,
    fileId => useDb().transaction(tx => applyWithCv(tx, user.id, { ip: clientIp(event) }, fileId)),
    ALREADY_SENT,
  )
  return toFileDto(file)
})
