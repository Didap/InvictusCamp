import { myAvailability } from '../../../domain/staff'

/** The periods of the signed-in person; `canEdit` only once the application is approved. */
export default defineEventHandler(async event => {
  const { profile } = await requireStaff(event)
  return myAvailability(useDb(), profile)
})
