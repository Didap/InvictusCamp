import { eq } from 'drizzle-orm'
import { loginSchema } from '#shared/schemas/auth'
import type { LoginResult } from '#shared/types/api'
import { ROLE_HOME } from '#shared/utils/routes'

let timingGuard: Promise<string> | null = null

export default defineEventHandler(async (event): Promise<LoginResult> => {
  const { email, password } = await parseBody(event, loginSchema)
  rateLimit(`login:ip:${clientIp(event)}`, 30, 60_000)
  rateLimit(`login:email:${email}`, 8, 5 * 60_000)
  const db = useDb()
  const [user] = await db.select().from(tables.users).where(eq(tables.users.email, email)).limit(1)
  // The same work whether or not the account exists, so the timing does not reveal registered addresses.
  timingGuard ??= hashPassword('invictus-camp-timing-guard')
  const valid = await verifyPassword(user?.passwordHash ?? (await timingGuard), password)
  if (!user?.passwordHash || !valid) {
    throw createError({ statusCode: 401, message: 'Email o password non corretti' })
  }
  if (user.status === 'disabled') {
    throw createError({ statusCode: 403, message: 'Questo account è disattivato: contatta l’amministrazione del camp' })
  }
  if (!user.emailVerifiedAt) {
    throw createError({
      statusCode: 403,
      message: 'Prima conferma il tuo indirizzo email: trovi il link nella mail che ti abbiamo inviato',
      data: { reason: 'email_not_verified' },
    })
  }
  await db
    .update(tables.users)
    .set({
      lastLoginAt: new Date(),
      ...(passwordNeedsReHash(user.passwordHash) ? { passwordHash: await hashPassword(password) } : {}),
    })
    .where(eq(tables.users.id, user.id))
  await signIn(event, user)
  return { user: toSessionUser(user), redirectTo: ROLE_HOME[user.role] }
})
