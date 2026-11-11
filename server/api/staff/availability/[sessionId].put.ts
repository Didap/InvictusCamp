import { availabilityAnswerSchema } from '#shared/schemas/staff'
import { setAvailability } from '../../../domain/staff'

/** "Ci sono" for the whole of a session, or not any more (approved staff only, spec 3.5). */
export default defineEventHandler(async event => {
  const { user } = await requireStaff(event, { approved: true })
  const sessionId = requireUuidParam(event, 'sessionId')
  const { available } = await parseBody(event, availabilityAnswerSchema)
  await setAvailability(useDb(), { userId: user.id, sessionId, available })
  return { available }
})
