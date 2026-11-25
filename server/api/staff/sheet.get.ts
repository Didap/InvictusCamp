import type { StaffSheetDto } from '#shared/types/staff'
import { myStaffSheet } from '../../domain/staff'

/** The personal sheet of the signed-in person, with the application as it was sent (never the review notes). */
export default defineEventHandler(async (event): Promise<StaffSheetDto> => {
  const { user, profile } = await requireStaff(event)
  return myStaffSheet(useDb(), user, profile)
})
