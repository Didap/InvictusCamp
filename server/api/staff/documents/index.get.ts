import { staffDocuments } from '../../../domain/staff'

/** The personal documents the signed-in person uploaded (downloads through GET /api/files/:id). */
export default defineEventHandler(async event => {
  const { user } = await requireStaff(event)
  return staffDocuments(useDb(), user.id)
})
