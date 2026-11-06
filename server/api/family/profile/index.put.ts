import { familyProfileSchema } from '#shared/schemas/families'
import type { FamilyProfileDto } from '#shared/types/families'
import { toFamilyProfile, updateFamilyData } from '../../../domain/families'

/** The family updates its own data: name, address, city, province, phone. */
export default defineEventHandler(async (event): Promise<FamilyProfileDto> => {
  const { family } = await requireFamily(event)
  const input = await parseBody(event, familyProfileSchema)
  return toFamilyProfile(await updateFamilyData(useDb(), family.id, input))
})
