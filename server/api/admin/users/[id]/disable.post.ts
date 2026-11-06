import { setUserEnabled } from '../../../../domain/users'

/** Disables an account (never your own): no sign-in, open sessions stop, pending links stop working. */
export default defineEventHandler(async event => {
  const admin = await requireAdmin(event)
  const userId = requireUuidParam(event, 'id')
  const user = await useDb().transaction(tx =>
    setUserEnabled(tx, userId, false, { userId: admin.id, ip: clientIp(event) }),
  )
  return { status: user.status }
})
