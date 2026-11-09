import { removeFamilyMember } from '../../../domain/families'

/** Removes a member of the signed-in family (never the only referent). */
export default defineEventHandler(async event => {
  const { user, family } = await requireFamily(event)
  const memberId = requireUuidParam(event, 'id')
  await useDb().transaction(tx =>
    removeFamilyMember(tx, { familyId: family.id, memberId, actor: { userId: user.id, ip: clientIp(event) } }),
  )
  return { ok: true }
})
