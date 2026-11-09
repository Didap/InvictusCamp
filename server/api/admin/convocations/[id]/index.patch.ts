import { convocationRoleSchema } from '#shared/schemas/staff'
import { setConvocationRole } from '../../../../domain/staff'

/** Changes the role of a person in the session. */
export default defineEventHandler(async event => {
  const admin = await requireAdmin(event)
  const id = requireUuidParam(event, 'id')
  const { role } = await parseBody(event, convocationRoleSchema)
  await useDb().transaction(tx =>
    setConvocationRole(tx, { id, role, actor: { userId: admin.id, ip: clientIp(event) } }),
  )
  return { ok: true }
})
