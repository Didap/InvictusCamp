import type { FamilyProfileDto } from '#shared/types/families'
import { toFamilyProfile } from '../../../domain/families'

/** The family's data and its questionnaire. */
export default defineEventHandler(async (event): Promise<FamilyProfileDto> => {
  const { family } = await requireFamily(event)
  return toFamilyProfile(family)
})
