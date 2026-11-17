import { staffTagsSchema } from '#shared/schemas/staff'
import { setStaffTags } from '../../../../domain/staff'

/** The «Valutazione» of a person: tags of the administration, never shown to the person. */
export default defineEventHandler(async event => {
  const admin = await requireAdmin(event)
  const userId = requireUuidParam(event, 'userId')
  const { tags } = await parseBody(event, staffTagsSchema)
  await useDb().transaction(tx => setStaffTags(tx, { userId, tags, actor: { userId: admin.id, ip: clientIp(event) } }))
  return { ok: true }
})
