import { and, eq, ne, sql } from 'drizzle-orm'
import { resetPasswordSchema } from '#shared/schemas/auth'
import { ROLE_HOME } from '#shared/utils/routes'
import { consumeToken } from '../../domain/tokens'

/** Sets a new password from the reset link; every other session of the account stops working. */
export default defineEventHandler(async event => {
  const { token, password } = await parseBody(event, resetPasswordSchema)
  rateLimit(`reset:${clientIp(event)}`, 20, 60 * 60_000)
  const passwordHash = await hashPassword(password)
  const invalid = () =>
    createError({ statusCode: 400, message: 'Il link non è valido o è scaduto: chiedine uno nuovo' })
  const user = await useDb().transaction(async tx => {
    const userId = await consumeToken(tx, token, 'reset_password')
    if (!userId) throw invalid()
    const [user] = await tx
      .update(tables.users)
      .set({
        passwordHash,
        passwordChangedAt: new Date(),
        // The link arrived by email: the address is confirmed.
        emailVerifiedAt: sql`coalesce(${tables.users.emailVerifiedAt}, now())`,
      })
      .where(and(eq(tables.users.id, userId), ne(tables.users.status, 'disabled')))
      .returning()
    if (!user) throw invalid()
    return user
  })
  await audit(event, { actorUserId: user.id, action: 'user.password_reset', entityType: 'user', entityId: user.id })
  await signIn(event, user)
  return { redirectTo: ROLE_HOME[user.role] }
})
