import type { StaffSheetDto } from '#shared/types/staff'
import { myStaffSheet } from '../../domain/staff'

/** The personal sheet of the signed-in person, with the health data and the PDF to sign. */
export default defineEventHandler(async (event): Promise<StaffSheetDto> => {
  const { user, profile } = await requireStaff(event)
  return myStaffSheet(useDb(), user, profile)
})
