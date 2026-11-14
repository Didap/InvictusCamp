import { familyProfileSchema } from '#shared/schemas/families'
import { familyFields, updateFamilyDataByAdmin } from '../../../../domain/families'

/** The administration changes a family's name, residence and phone on its behalf; a new name redoes the release. */
export default defineEventHandler(async event => {
  const admin = await requireAdmin(event)
  const familyId = requireUuidParam(event, 'id')
  const data = await parseBody(event, familyProfileSchema)
  const actor = { userId: admin.id, ip: clientIp(event) }
  const { row, emails } = await useDb().transaction(async tx => {
    const row = await updateFamilyDataByAdmin(tx, { familyId, data, actor })
    return { row, emails: await familyChanged(tx, event, row, actor) }
  })
  await deliver(emails)
  return familyFields(row)
})
