import { replaceStaffCv, toFileDto } from '../../domain/staff'

/** The CV (PDF only) from the staff area: a new one takes the place of the one on the profile (spec 3.4). */
export default defineEventHandler(async event => {
  const { user } = await requireStaff(event)
  const upload = await readUpload(event, { accept: ['application/pdf'] })
  const file = await saveFile({
    data: upload.data,
    originalName: upload.filename,
    mimeType: upload.mimeType,
    purpose: 'cv',
    ownerUserId: user.id,
    uploadedBy: user.id,
  })
  let previous: string | null
  try {
    previous = await useDb().transaction(tx =>
      replaceStaffCv(tx, { userId: user.id, fileId: file.id, actor: { userId: user.id, ip: clientIp(event) } }),
    )
  } catch (error) {
    await removeFile(file.id)
    throw error
  }
  if (previous) await removeFile(previous)
  return toFileDto(file)
})
