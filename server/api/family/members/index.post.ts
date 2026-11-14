import { memberSchema } from '#shared/schemas/families'
import type { OwnFamilyMember } from '#shared/types/families'
import { addFamilyMember, guestAgeNotice } from '../../../domain/families'

/** Adds a member; health details are refused without the consent (docs/spec.md, 3.8). May send the age notice. */
export default defineEventHandler(async (event): Promise<OwnFamilyMember> => {
  const { user, family } = await requireFamily(event)
  const member = await parseBody(event, memberSchema)
  const actor = { userId: user.id, ip: clientIp(event) }
  const { saved, emails } = await useDb().transaction(async tx => ({
    saved: await addFamilyMember(tx, { familyId: family.id, member, actor }),
    emails: family.ageNoticeAt ? [] : await guestAgeNotice(tx, { familyId: family.id, ctx: emailContext() }),
  }))
  await deliver(emails)
  return saved
})
