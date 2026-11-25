import { trainingInterestSchema } from '#shared/schemas/staff'
import { setTrainingInterest } from '../../../domain/training'

/** Interested in a training, or not any more. */
export default defineEventHandler(async event => {
  const { user } = await requireStaff(event)
  const optionId = requireUuidParam(event, 'id')
  const { interested } = await parseBody(event, trainingInterestSchema)
  await useDb().transaction(tx => setTrainingInterest(tx, { userId: user.id, optionId, interested }))
  return { interested }
})
