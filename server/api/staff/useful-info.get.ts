import type { StaffUsefulInfoDto } from '#shared/types/staff'
import { staffUsefulInfo } from '../../domain/staff'

/** The health data of the signed-in staff member (their own), from the profile just read. */
export default defineEventHandler(async (event): Promise<StaffUsefulInfoDto> => {
  const { profile } = await requireStaff(event)
  return staffUsefulInfo(profile)
})
