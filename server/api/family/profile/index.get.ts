import type { FamilyProfileDto } from '#shared/types/families'
import { familyProfile } from '../../../domain/families'

/** The family data, with the answers and the cards the family already has. */
export default defineEventHandler(async (event): Promise<FamilyProfileDto> => {
  const { family } = await requireFamily(event)
  return familyProfile(useDb(), family)
})
