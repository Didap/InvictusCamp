import { deleteTrainingOption } from '../../../domain/training'

/** Deletes a training and the interests in it. */
export default defineEventHandler(async event => {
  const admin = await requireAdmin(event)
  const id = requireUuidParam(event, 'id')
  await useDb().transaction(tx => deleteTrainingOption(tx, id, { userId: admin.id, ip: clientIp(event) }))
  return { ok: true }
})
