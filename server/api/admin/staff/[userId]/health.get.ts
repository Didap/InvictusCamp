import { eq } from 'drizzle-orm'
import type { StaffUsefulInfoDto } from '#shared/types/staff'
import { staffProfiles } from '../../../../db/schema'
import { staffUsefulInfo } from '../../../../domain/staff'

/**
 * The reserved section of a staff member's page: allergies, diet and the other details, loaded only when the
 * administration opens it. Reading special category data is recorded in the audit log.
 */
export default defineEventHandler(async (event): Promise<StaffUsefulInfoDto> => {
  const admin = await requireAdmin(event)
  const userId = requireUuidParam(event, 'userId')
  const [profile] = await useDb().select().from(staffProfiles).where(eq(staffProfiles.userId, userId)).limit(1)
  if (!profile) throw createError({ statusCode: 404, message: 'Persona dello staff non trovata' })
  if (profile.usefulInfoConsentAt) {
    await audit(event, { actorUserId: admin.id, action: 'staff.health_view', entityType: 'user', entityId: userId })
  }
  return staffUsefulInfo(profile)
})
