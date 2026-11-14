import { memberSchema } from '#shared/schemas/families'
import type { OwnFamilyMember } from '#shared/types/families'
import { guestAgeNotice, updateFamilyMember } from '../../../domain/families'

/**
 * Changes a member of the signed-in family (404 for anyone else's); health changes are audited. The last card
 * completed may send the email about the camp's ages.
 */
export default defineEventHandler(async (event): Promise<OwnFamilyMember> => {
  const { user, family } = await requireFamily(event)
  const memberId = requireUuidParam(event, 'id')
  const member = await parseBody(event, memberSchema)
  const actor = { userId: user.id, ip: clientIp(event) }
  const { saved, emails } = await useDb().transaction(async tx => ({
    saved: await updateFamilyMember(tx, { familyId: family.id, memberId, member, actor }),
    emails: family.ageNoticeAt ? [] : await guestAgeNotice(tx, { familyId: family.id, ctx: emailContext() }),
  }))
  await deliver(emails)
  return saved
})
