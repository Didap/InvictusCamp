import { setUserEnabled } from '../../../../domain/users'

/** Enables an account again: active, or invited when it never chose a password. */
export default defineEventHandler(async event => {
  const admin = await requireAdmin(event)
  const userId = requireUuidParam(event, 'id')
  const user = await useDb().transaction(tx =>
    setUserEnabled(tx, userId, true, { userId: admin.id, ip: clientIp(event) }),
  )
  return { status: user.status }
})
