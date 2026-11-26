import { saveStaffUsefulInfo } from '#server/domain/staff'
import type { StaffUsefulInfoDto } from '#shared/types/staff'

/** Deletes the health data of the personal sheet and withdraws the consent, whatever the rest of the sheet. */
export default defineEventHandler(async (event): Promise<StaffUsefulInfoDto> => {
  const { user } = await requireStaff(event)
  return useDb().transaction(tx =>
    saveStaffUsefulInfo(tx, {
      userId: user.id,
      value: { info: {}, consent: false },
      actor: { userId: user.id, ip: clientIp(event) },
    }),
  )
})
