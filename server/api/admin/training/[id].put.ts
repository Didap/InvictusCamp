import { trainingOptionSchema } from '#shared/schemas/staff'
import { updateTrainingOption } from '../../../domain/training'

/** Changes the title or the description of a training: the interests stay. */
export default defineEventHandler(async event => {
  const admin = await requireAdmin(event)
  const id = requireUuidParam(event, 'id')
  const input = await parseBody(event, trainingOptionSchema)
  await useDb().transaction(tx => updateTrainingOption(tx, id, input, { userId: admin.id, ip: clientIp(event) }))
  return { ok: true }
})
