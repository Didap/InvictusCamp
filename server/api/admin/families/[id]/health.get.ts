import type { AdminFamilyHealth } from '#shared/types/families'
import { adminFamilyHealth } from '../../../../domain/families'

/**
 * The reserved section of the admin record: the members' health details, loaded only when the
 * administration opens it. Reading special category data is recorded in the audit log.
 */
export default defineEventHandler(async (event): Promise<AdminFamilyHealth> => {
  const admin = await requireAdmin(event)
  const familyId = requireUuidParam(event, 'id')
  const health = await adminFamilyHealth(useDb(), familyId)
  if (health.healthDataConsentAt) {
    await audit(event, {
      actorUserId: admin.id,
      action: 'family.health_view',
      entityType: 'family',
      entityId: familyId,
    })
  }
  return health
})
