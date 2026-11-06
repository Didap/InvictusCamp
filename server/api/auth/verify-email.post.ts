import { eq, sql } from 'drizzle-orm'
import { verifyEmailSchema } from '#shared/schemas/auth'
import { ROLE_HOME } from '#shared/utils/routes'
import { consumeToken } from '../../domain/tokens'

/** The link of the confirmation email: confirms the address and signs the user in. */
export default defineEventHandler(async event => {
  const { token } = await parseBody(event, verifyEmailSchema)
  rateLimit(`verify:${clientIp(event)}`, 30, 60 * 60_000)
  const db = useDb()
  const userId = await consumeToken(db, token, 'verify_email')
  if (!userId) throw createError({ statusCode: 400, message: 'Il link non è valido o è scaduto: chiedine uno nuovo' })
  const [user] = await db
    .update(tables.users)
    .set({ emailVerifiedAt: sql`coalesce(${tables.users.emailVerifiedAt}, now())` })
    .where(eq(tables.users.id, userId))
    .returning()
  if (!user || user.status !== 'active') {
    throw createError({ statusCode: 400, message: 'Il link non è valido o è scaduto: chiedine uno nuovo' })
  }
  await signIn(event, user)
  return { redirectTo: ROLE_HOME[user.role] }
})
