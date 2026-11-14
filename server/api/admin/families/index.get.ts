import { adminFamilyListQuerySchema } from '#shared/schemas/families'
import type { FamilyListResponse } from '#shared/types/families'
import { listFamilies } from '../../../domain/families'

/**
 * The families of the camp: search, filters, one page. Never any health detail (docs/spec.md, 5); filtering by
 * the type of condition reads health data, so it is audited.
 */
export default defineEventHandler(async (event): Promise<FamilyListResponse> => {
  const admin = await requireAdmin(event)
  const query = parseQuery(event, adminFamilyListQuerySchema)
  if (query.condition) {
    await audit(event, {
      actorUserId: admin.id,
      action: 'family.health_filter',
      entityType: 'family',
      data: { condition: query.condition },
    })
  }
  return listFamilies(useDb(), query)
})
