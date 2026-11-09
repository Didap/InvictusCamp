import { eq } from 'drizzle-orm'
import { registerFamilySchema } from '#shared/schemas/auth'
import { verifyEmailEmail } from '../../emails/auth'
import { issueToken } from '../../domain/tokens'

/** A family signs up by itself; it signs in after confirming its address. */
export default defineEventHandler(async event => {
  const input = await parseBody(event, registerFamilySchema)
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
          role: 'family',
          status: 'active',
          firstName: input.firstName,
          lastName: input.lastName,
          phone: input.phone || null,
        })
        .returning()
      const [family] = await tx
        .insert(tables.families)
        .values({ userId: user!.id, name: input.familyName, phone: input.phone || null, privacyConsentAt: new Date() })
        .returning({ id: tables.families.id })
      // The person who signs up is the first member and the referent of the family.
      await tx.insert(tables.familyMembers).values({
        familyId: family!.id,
        firstName: input.firstName,
        lastName: input.lastName,
        relationship: 'parent',
        isReferent: true,
      })
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
    data: { role: 'family' },
  })
  return { ok: true, email: user.email }
})

function duplicateEmail() {
  return createError({
    statusCode: 409,
    message: 'Esiste già un account con questa email: accedi o reimposta la password',
  })
}
