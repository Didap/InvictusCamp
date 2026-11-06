import { familyProfileSchema } from '#shared/schemas/families'
import type { FamilyProfileDto } from '#shared/types/families'
import { toFamilyProfile, updateFamilyDataByAdmin } from '../../../../domain/families'

/** The administration changes a family's data on its behalf (name, address, city, province, phone). */
export default defineEventHandler(async (event): Promise<FamilyProfileDto> => {
  const admin = await requireAdmin(event)
  const familyId = requireUuidParam(event, 'id')
  const data = await parseBody(event, familyProfileSchema)
  const row = await useDb().transaction(tx =>
    updateFamilyDataByAdmin(tx, { familyId, data, actor: { userId: admin.id, ip: clientIp(event) } }),
  )
  return toFamilyProfile(row)
})
