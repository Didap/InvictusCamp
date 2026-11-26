import type { MyStaffResource } from '#shared/types/documents'
import { myStaffResources } from '../../../domain/staff-resources'

/** «Risorse utili»: the documents to read and accept, and those to consult. */
export default defineEventHandler(async (event): Promise<MyStaffResource[]> => {
  const { user } = await requireStaff(event)
  return myStaffResources(useDb(), user.id)
})
