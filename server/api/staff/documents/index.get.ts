import type { MyStaffDocuments } from '#shared/types/staff'
import { myStaffDocuments } from '../../../domain/staff'

/** The CV and the personal documents of the signed-in person (downloads through GET /api/files/:id). */
export default defineEventHandler(async (event): Promise<MyStaffDocuments> => {
  const { profile } = await requireStaff(event)
  return myStaffDocuments(useDb(), profile)
})
