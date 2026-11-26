import { staffSheetFormSchema } from '#shared/schemas/staff'
import type { StaffSheetSaved } from '#shared/types/staff'
import { saveStaffSheet, saveStaffUsefulInfo, sheetSignature, staffUsefulInfo } from '../../domain/staff'

/**
 * Saves the personal sheet (birth, codice fiscale, residence, T-shirt size, the staff's contract formula) and the
 * health data with the consent, together. Complete, the sheet's PDF is (re)made and the person asked to sign it
 * (server/domain/staff-sheets.ts); the health data never goes in it.
 */
export default defineEventHandler(async (event): Promise<StaffSheetSaved> => {
  const { user, profile } = await requireStaff(event)
  const { health, ...value } = await parseBody(event, staffSheetFormSchema(profile.team, staffUsefulInfo(profile)))
  const actor = { userId: user.id, ip: clientIp(event) }
  const { saved, emails } = await useDb().transaction(async tx => {
    const sheet = await saveStaffSheet(tx, { userId: user.id, value, actor })
    const savedHealth = await saveStaffUsefulInfo(tx, { userId: user.id, value: health, actor })
    const emails = await staffSheetChanged(tx, user.id, actor)
    return { saved: { sheet, health: savedHealth, signature: await sheetSignature(tx, user.id) }, emails }
  })
  await deliver(emails)
  return saved
})
