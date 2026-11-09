import { familyProfileSchema } from '#shared/schemas/families'
import { familyFields, updateFamilyDataByAdmin } from '../../../../domain/families'

/** The administration changes a family's name, residence and phone on its behalf. */
export default defineEventHandler(async event => {
  const admin = await requireAdmin(event)
  const familyId = requireUuidParam(event, 'id')
  const data = await parseBody(event, familyProfileSchema)
  const row = await useDb().transaction(tx =>
    updateFamilyDataByAdmin(tx, { familyId, data, actor: { userId: admin.id, ip: clientIp(event) } }),
  )
  return familyFields(row)
})
