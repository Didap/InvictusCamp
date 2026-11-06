import type { FamilyMembersResponse } from '#shared/types/families'
import { ownFamilyMembers } from '../../../domain/families'

/** The members of the signed-in family; health details only while the consent is given. */
export default defineEventHandler(async (event): Promise<FamilyMembersResponse> => {
  const { family } = await requireFamily(event)
  return ownFamilyMembers(useDb(), family.id)
})
