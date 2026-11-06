import { staffHome } from '../../domain/staff'

/** The home of the signed-in staff member, whatever the status of the application. */
export default defineEventHandler(async event => {
  const { profile } = await requireStaff(event)
  return staffHome(useDb(), profile)
})
