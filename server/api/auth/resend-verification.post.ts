import { eq } from 'drizzle-orm'
import { resendVerificationSchema } from '#shared/schemas/auth'
import { verifyEmailEmail } from '../../emails/auth'
import { issueToken } from '../../domain/tokens'

/** A new confirmation link. Always answers ok, so it does not reveal which addresses have an account. */
export default defineEventHandler(async event => {
  const { email } = await parseBody(event, resendVerificationSchema)
  rateLimit(`resend:ip:${clientIp(event)}`, 10, 60 * 60_000)
  rateLimit(`resend:email:${email}`, 3, 60 * 60_000)
  const db = useDb()
  const [user] = await db.select().from(tables.users).where(eq(tables.users.email, email)).limit(1)
  if (user && user.status === 'active' && user.passwordHash && !user.emailVerifiedAt) {
    const token = await issueToken(db, user.id, 'verify_email')
    await deliver(
      verifyEmailEmail(emailContext(), { to: user.email, toUserId: user.id, firstName: user.firstName, token }),
    )
  }
  return { ok: true }
})
