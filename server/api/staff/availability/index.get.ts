import { myAvailability } from '../../../domain/staff'

/** The sessions not started yet with the answer of the signed-in person; `canEdit` once approved. */
export default defineEventHandler(async event => {
  const { profile } = await requireStaff(event)
  return myAvailability(useDb(), profile)
})
