import { cardsChanged } from '#server/domain/releases'
import { removeFamilyMember } from '../../../domain/families'

/** Removes a member of the signed-in family (never the only referent); may send the age notice. */
export default defineEventHandler(async event => {
  const { user, family } = await requireFamily(event)
  const memberId = requireUuidParam(event, 'id')
  const actor = { userId: user.id, ip: clientIp(event) }
  const emails = await useDb().transaction(async tx => {
    await removeFamilyMember(tx, { familyId: family.id, memberId, actor })
    return cardsChanged(tx, {
      familyId: family.id,
      ctx: emailContext(),
      uploadsDir: uploadsDir(),
      actor,
      ageNoticeSent: Boolean(family.ageNoticeAt),
    })
  })
  await deliver(emails)
  return { ok: true }
})
