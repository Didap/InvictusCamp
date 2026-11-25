import { addStaffCv, toFileDto } from '../../domain/staff'

/**
 * The CV (PDF only) from the staff area, for someone who has none (invited as approved): the CV sent with an
 * application stays as it was (spec 3.4).
 */
export default defineEventHandler(async event => {
  const { user } = await requireStaff(event)
  const file = await uploadCv(
    event,
    user.id,
    fileId =>
      useDb().transaction(tx =>
        addStaffCv(tx, { userId: user.id, fileId, actor: { userId: user.id, ip: clientIp(event) } }),
      ),
    'Il curriculum c’è già: un CV aggiornato caricalo tra gli altri documenti',
  )
  return toFileDto(file)
})
