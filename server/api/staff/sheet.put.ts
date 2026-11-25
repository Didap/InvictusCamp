import { staffSheetSchema } from '#shared/schemas/staff'
import type { StaffSheet } from '#shared/types/staff'
import { saveStaffSheet } from '../../domain/staff'

/** Saves the personal sheet: birth, codice fiscale, residence, T-shirt size. */
export default defineEventHandler(async (event): Promise<StaffSheet> => {
  const { user } = await requireStaff(event)
  const value = await parseBody(event, staffSheetSchema)
  return useDb().transaction(tx =>
    saveStaffSheet(tx, { userId: user.id, value, actor: { userId: user.id, ip: clientIp(event) } }),
  )
})
