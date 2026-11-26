import { trainingOptionSchema } from '#shared/schemas/staff'
import { createTrainingOption } from '../../../domain/training'

/** A new training proposed in «Formazione»: staff and v-team see it at once. */
export default defineEventHandler(async event => {
  const admin = await requireAdmin(event)
  const input = await parseBody(event, trainingOptionSchema)
  const id = await useDb().transaction(tx => createTrainingOption(tx, input, { userId: admin.id, ip: clientIp(event) }))
  return { id }
})
