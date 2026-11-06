import { availabilitySchema } from '#shared/schemas/staff'
import { addAvailability } from '../../../domain/staff'

/** Adds a period of availability (approved staff only). */
export default defineEventHandler(async event => {
  const { user } = await requireStaff(event, { approved: true })
  const input = await parseBody(event, availabilitySchema)
  return addAvailability(useDb(), user.id, input)
})
