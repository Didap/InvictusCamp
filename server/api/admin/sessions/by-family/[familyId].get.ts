import { familyHistory } from '#server/domain/sessions'
import type { FamilyParticipationItem } from '#shared/types/sessions'

/** The sessions of one family, latest first (FamilyHistory on the admin family page). */
export default defineEventHandler(async (event): Promise<FamilyParticipationItem[]> => {
  await requireAdmin(event)
  return familyHistory(useDb(), requireUuidParam(event, 'familyId'))
})
