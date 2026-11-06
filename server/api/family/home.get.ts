import type { FamilyHomeDto } from '#shared/types/families'
import { familyHome } from '../../domain/families'

/** The family home: greeting, what is left to do, the next confirmed session. */
export default defineEventHandler(async (event): Promise<FamilyHomeDto> => {
  const { user, family } = await requireFamily(event)
  return familyHome(useDb(), { userId: user.id, firstName: user.firstName, familyId: family.id })
})
