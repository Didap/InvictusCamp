import type { AdminFamilyDetail } from '#shared/types/families'
import { adminFamilyDetail } from '../../../../domain/families'

/** The record of one family, without health details (those are in ./health). */
export default defineEventHandler(async (event): Promise<AdminFamilyDetail> => {
  await requireAdmin(event)
  return adminFamilyDetail(useDb(), requireUuidParam(event, 'id'))
})
