import type { StaffSheetSignature } from '#shared/types/staff'
import { sheetSignature } from '../../../domain/staff'

/** «Prepara il PDF da firmare»: a complete sheet with no PDF in force gets one (server/domain/staff-sheets.ts). */
export default defineEventHandler(async (event): Promise<StaffSheetSignature | null> => {
  const { user } = await requireStaff(event)
  const actor = { userId: user.id, ip: clientIp(event) }
  const { signature, emails } = await useDb().transaction(async tx => {
    const emails = await staffSheetChanged(tx, user.id, actor)
    return { emails, signature: await sheetSignature(tx, user.id) }
  })
  await deliver(emails)
  return signature
})
