import { eq } from 'drizzle-orm'
import { registerStaffSchema } from '#shared/schemas/auth'
import { verifyEmailEmail } from '../../emails/auth'
import { issueToken } from '../../domain/tokens'

/** A person applies to join the staff: the account now, the application inside the platform. */
export default defineEventHandler(async event => {
  const input = await parseBody(event, registerStaffSchema)
  rateLimit(`register:${clientIp(event)}`, 10, 60 * 60_000)
  const db = useDb()
  const [existing] = await db
    .select({ id: tables.users.id })
    .from(tables.users)
    .where(eq(tables.users.email, input.email))
    .limit(1)
  if (existing) throw duplicateEmail()
  const passwordHash = await hashPassword(input.password)
  const { user, token } = await db
    .transaction(async tx => {
      const [user] = await tx
        .insert(tables.users)
        .values({
          email: input.email,
          passwordHash,
          role: 'staff',
          status: 'active',
          firstName: input.firstName,
          lastName: input.lastName,
          phone: input.phone || null,
        })
        .returning()
      await tx.insert(tables.staffProfiles).values({ userId: user!.id, status: 'registered' })
      return { user: user!, token: await issueToken(tx, user!.id, 'verify_email') }
    })
    .catch(error => {
      throw isUniqueViolation(error) ? duplicateEmail() : error
    })
  await deliver(
    verifyEmailEmail(emailContext(), { to: user.email, toUserId: user.id, firstName: user.firstName, token }),
  )
  await audit(event, {
    actorUserId: user.id,
    action: 'user.register',
    entityType: 'user',
    entityId: user.id,
    data: { role: 'staff' },
  })
  return { ok: true, email: user.email }
})

function duplicateEmail() {
  return createError({
    statusCode: 409,
    message: 'Esiste già un account con questa email: accedi o reimposta la password',
  })
}
