import { familyDataSchema } from '#shared/schemas/families'
import type { FamilyDataResult } from '#shared/types/families'
import { guestAgeNotice, saveFamilyData, toFamilyProfile } from '../../../domain/families'

/**
 * Confirms the family data; the members' cards still missing are created, empty ones beyond it removed
 * (docs/spec.md, 3.8), which may complete the cards and send the age notice.
 */
export default defineEventHandler(async (event): Promise<FamilyDataResult> => {
  const { user, family } = await requireFamily(event)
  const data = await parseBody(event, familyDataSchema)
  const { saved, emails } = await useDb().transaction(async tx => ({
    saved: await saveFamilyData(tx, { familyId: family.id, data, actor: { userId: user.id, ip: clientIp(event) } }),
    emails: family.ageNoticeAt ? [] : await guestAgeNotice(tx, { familyId: family.id, ctx: emailContext() }),
  }))
  await deliver(emails)
  return {
    profile: toFamilyProfile(saved.family, saved.cards),
    cardsCreated: saved.cardsCreated,
    cardsRemoved: saved.cardsRemoved,
  }
})
