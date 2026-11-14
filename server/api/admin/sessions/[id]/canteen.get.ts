import { canteenOf } from '#server/domain/canteen'
import type { CanteenDto } from '#shared/types/canteen'

/** The canteen summary of the session: allergies and diets with names are health data, so reading is audited. */
export default defineEventHandler(async (event): Promise<CanteenDto> => {
  const admin = await requireAdmin(event)
  const sessionId = requireUuidParam(event, 'id')
  const summary = await canteenOf(useDb(), sessionId)
  await audit(event, {
    actorUserId: admin.id,
    action: 'session.canteen_view',
    entityType: 'session',
    entityId: sessionId,
  })
  return summary
})
