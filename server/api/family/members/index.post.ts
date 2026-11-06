import { memberSchema } from '#shared/schemas/families'
import type { OwnFamilyMember } from '#shared/types/families'
import { addFamilyMember } from '../../../domain/families'

/** Adds a member; health details are refused without the consent (docs/spec.md, 3.8). */
export default defineEventHandler(async (event): Promise<OwnFamilyMember> => {
  const { user, family } = await requireFamily(event)
  const member = await parseBody(event, memberSchema)
  return useDb().transaction(tx =>
    addFamilyMember(tx, { familyId: family.id, member, actor: { userId: user.id, ip: clientIp(event) } }),
  )
})
