import { familySessions } from '#server/domain/sessions'
import type { FamilySessionItem } from '#shared/types/sessions'

/** The sessions of the signed-in family, only once invited (spec 3.3). */
export default defineEventHandler(async (event): Promise<FamilySessionItem[]> => {
  const { family } = await requireFamily(event)
  return familySessions(useDb(), family.id)
})
