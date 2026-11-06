import { myApplication } from '../../../domain/staff'

/** The application of the signed-in person (never the internal notes of the review). */
export default defineEventHandler(async event => {
  const { user } = await requireStaff(event)
  return myApplication(useDb(), user.id)
})
