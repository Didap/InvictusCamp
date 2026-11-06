import { eq } from 'drizzle-orm'
import { changePasswordSchema } from '#shared/schemas/auth'

/** Changes the password; sessions on other devices stop working, this one is renewed. */
export default defineEventHandler(async event => {
  const user = await requireUser(event)
  const { currentPassword, newPassword } = await parseBody(event, changePasswordSchema)
  rateLimit(`password:${user.id}`, 8, 15 * 60_000)
  if (!user.passwordHash || !(await verifyPassword(user.passwordHash, currentPassword))) {
    throw createError({ statusCode: 400, message: 'La password attuale non è corretta' })
  }
  const [updated] = await useDb()
    .update(tables.users)
    .set({ passwordHash: await hashPassword(newPassword), passwordChangedAt: new Date() })
    .where(eq(tables.users.id, user.id))
    .returning()
  await audit(event, { actorUserId: user.id, action: 'user.password_change', entityType: 'user', entityId: user.id })
  await signIn(event, updated!)
  return { ok: true }
})
