import { staffSheetSchema } from '#shared/schemas/staff'
import type { StaffSheetSaved } from '#shared/types/staff'
import { saveStaffSheet, sheetSignature } from '../../domain/staff'

/**
 * Saves the personal sheet: birth, codice fiscale, residence, T-shirt size. Complete, its PDF is (re)made and the
 * person asked to sign it (server/domain/staff-sheets.ts).
 */
export default defineEventHandler(async (event): Promise<StaffSheetSaved> => {
  const { user } = await requireStaff(event)
  const value = await parseBody(event, staffSheetSchema)
  const actor = { userId: user.id, ip: clientIp(event) }
  const { saved, emails } = await useDb().transaction(async tx => {
    const sheet = await saveStaffSheet(tx, { userId: user.id, value, actor })
    const emails = await staffSheetChanged(tx, user.id, actor)
    return { saved: { sheet, signature: await sheetSignature(tx, user.id) }, emails }
  })
  await deliver(emails)
  return saved
})
