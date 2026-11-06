import { memberSchema } from '#shared/schemas/families'
import type { OwnFamilyMember } from '#shared/types/families'
import { updateFamilyMember } from '../../../domain/families'

/** Changes a member of the signed-in family (404 for anyone else's); health changes are audited. */
export default defineEventHandler(async (event): Promise<OwnFamilyMember> => {
  const { user, family } = await requireFamily(event)
  const memberId = requireUuidParam(event, 'id')
  const member = await parseBody(event, memberSchema)
  return useDb().transaction(tx =>
    updateFamilyMember(tx, { familyId: family.id, memberId, member, actor: { userId: user.id, ip: clientIp(event) } }),
  )
})
