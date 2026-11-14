import type { StaffUsefulInfoDto } from '#shared/types/staff'

/** The canteen details of the signed-in staff member (their own health data), from the profile just read. */
export default defineEventHandler(async (event): Promise<StaffUsefulInfoDto> => {
  const { profile } = await requireStaff(event)
  return { info: profile.usefulInfo, consentAt: profile.usefulInfoConsentAt?.toISOString() ?? null }
})
