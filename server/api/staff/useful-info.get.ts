import { staffUsefulInfo } from '#server/domain/staff'
import type { StaffUsefulInfoDto } from '#shared/types/staff'

/** The canteen details of the signed-in staff member (their own health data). */
export default defineEventHandler(async (event): Promise<StaffUsefulInfoDto> => {
  const { user } = await requireStaff(event)
  return staffUsefulInfo(useDb(), user.id)
})
