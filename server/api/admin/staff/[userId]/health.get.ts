import type { StaffUsefulInfoDto } from '#shared/types/staff'
import { adminStaffHealth } from '../../../../domain/staff'

/**
 * The reserved section of a staff member's page: allergies, diet and the other details, loaded only when the
 * administration opens it. Reading special category data is recorded in the audit log.
 */
export default defineEventHandler(async (event): Promise<StaffUsefulInfoDto> => {
  const admin = await requireAdmin(event)
  const userId = requireUuidParam(event, 'userId')
  const health = await adminStaffHealth(useDb(), userId)
  if (health.consentAt) {
    await audit(event, { actorUserId: admin.id, action: 'staff.health_view', entityType: 'user', entityId: userId })
  }
  return health
})
