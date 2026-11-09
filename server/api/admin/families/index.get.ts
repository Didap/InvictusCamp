import { adminFamilyListQuerySchema } from '#shared/schemas/families'
import type { FamilyListResponse } from '#shared/types/families'
import { listFamilies } from '../../../domain/families'

/** The families of the camp: search, filters, one page. Never any health detail (docs/spec.md, 5). */
export default defineEventHandler(async (event): Promise<FamilyListResponse> => {
  await requireAdmin(event)
  const query = parseQuery(event, adminFamilyListQuerySchema)
  return listFamilies(useDb(), query)
})
