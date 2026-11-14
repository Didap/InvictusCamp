import { saveStaffUsefulInfo } from '#server/domain/staff'
import { staffUsefulInfoSchema } from '#shared/schemas/staff'
import type { StaffUsefulInfoDto } from '#shared/types/staff'

/** Saves the canteen details with the consent, or clears them. */
export default defineEventHandler(async (event): Promise<StaffUsefulInfoDto> => {
  const { user } = await requireStaff(event)
  const value = await parseBody(event, staffUsefulInfoSchema)
  return useDb().transaction(tx =>
    saveStaffUsefulInfo(tx, { userId: user.id, value, actor: { userId: user.id, ip: clientIp(event) } }),
  )
})
