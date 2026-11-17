import { staffRolesSchema } from '#shared/schemas/staff'
import { setStaffRoles } from '../../../../domain/staff'

/** The roles the administration gives a person (spec 3.4). */
export default defineEventHandler(async event => {
  const admin = await requireAdmin(event)
  const userId = requireUuidParam(event, 'userId')
  const { roles } = await parseBody(event, staffRolesSchema)
  await useDb().transaction(tx =>
    setStaffRoles(tx, { userId, roles, actor: { userId: admin.id, ip: clientIp(event) } }),
  )
  return { ok: true }
})
