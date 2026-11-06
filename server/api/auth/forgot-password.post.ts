import { eq } from 'drizzle-orm'
import { forgotPasswordSchema } from '#shared/schemas/auth'
import { inviteEmail, resetPasswordEmail } from '../../emails/auth'
import { issueToken } from '../../domain/tokens'

/**
 * Sends the reset link (or, to an invited user who never chose a password, a fresh invitation).
 * Always answers ok, so it does not reveal which addresses have an account.
 */
export default defineEventHandler(async event => {
  const { email } = await parseBody(event, forgotPasswordSchema)
  rateLimit(`forgot:ip:${clientIp(event)}`, 10, 60 * 60_000)
  rateLimit(`forgot:email:${email}`, 3, 60 * 60_000)
  const db = useDb()
  const [user] = await db.select().from(tables.users).where(eq(tables.users.email, email)).limit(1)
  if (user && user.status !== 'disabled') {
    const recipient = { to: user.email, toUserId: user.id, firstName: user.firstName }
    if (user.status === 'invited' || !user.passwordHash) {
      const token = await issueToken(db, user.id, 'invite')
      await deliver(inviteEmail(emailContext(), { ...recipient, role: user.role, token }))
    } else {
      const token = await issueToken(db, user.id, 'reset_password')
      await deliver(resetPasswordEmail(emailContext(), { ...recipient, token }))
    }
  }
  return { ok: true }
})
