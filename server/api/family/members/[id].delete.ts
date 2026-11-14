import { guestAgeNotice, removeFamilyMember } from '../../../domain/families'

/** Removes a member of the signed-in family (never the only referent); may send the age notice. */
export default defineEventHandler(async event => {
  const { user, family } = await requireFamily(event)
  const memberId = requireUuidParam(event, 'id')
  const emails = await useDb().transaction(async tx => {
    await removeFamilyMember(tx, { familyId: family.id, memberId, actor: { userId: user.id, ip: clientIp(event) } })
    return family.ageNoticeAt ? [] : guestAgeNotice(tx, { familyId: family.id, ctx: emailContext() })
  })
  await deliver(emails)
  return { ok: true }
})
