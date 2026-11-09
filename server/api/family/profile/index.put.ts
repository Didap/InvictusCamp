import { familyDataSchema } from '#shared/schemas/families'
import type { FamilyDataResult } from '#shared/types/families'
import { saveFamilyData, toFamilyProfile } from '../../../domain/families'

/** Confirms the family data; the members' cards still missing are created (docs/spec.md, 3.8). */
export default defineEventHandler(async (event): Promise<FamilyDataResult> => {
  const { user, family } = await requireFamily(event)
  const data = await parseBody(event, familyDataSchema)
  const saved = await useDb().transaction(tx =>
    saveFamilyData(tx, { familyId: family.id, data, actor: { userId: user.id, ip: clientIp(event) } }),
  )
  return { profile: toFamilyProfile(saved.family, saved.cards), cardsCreated: saved.cardsCreated }
})
