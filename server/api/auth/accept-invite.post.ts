import { and, eq, ne, sql } from 'drizzle-orm'
import { acceptInviteSchema } from '#shared/schemas/auth'
import { ROLE_HOME } from '#shared/utils/routes'
import { consumeToken } from '../../domain/tokens'

/** The invited user chooses a password: the account becomes active and signs in. */
export default defineEventHandler(async event => {
  const { token, password } = await parseBody(event, acceptInviteSchema)
  rateLimit(`accept-invite:${clientIp(event)}`, 20, 60 * 60_000)
  const passwordHash = await hashPassword(password)
  const invalid = () =>
    createError({
      statusCode: 400,
      message: 'L’invito non è valido o è scaduto: chiedi all’amministrazione del camp di inviarne uno nuovo',
    })
  const user = await useDb().transaction(async tx => {
    const userId = await consumeToken(tx, token, 'invite')
    if (!userId) throw invalid()
    const now = new Date()
    const [user] = await tx
      .update(tables.users)
      .set({ passwordHash, status: 'active', emailVerifiedAt: now, passwordChangedAt: now })
      .where(and(eq(tables.users.id, userId), ne(tables.users.status, 'disabled')))
      .returning()
    if (!user) throw invalid()
    // The administration usually creates these with the invitation; make sure they exist.
    if (user.role === 'family') {
      await tx
        .insert(tables.families)
        .values({ userId: user.id, name: `Famiglia ${user.lastName}` })
        .onConflictDoNothing()
      await tx
        .update(tables.families)
        .set({ privacyConsentAt: sql`coalesce(${tables.families.privacyConsentAt}, now())` })
        .where(eq(tables.families.userId, user.id))
    }
    if (user.role === 'staff') {
      await tx.insert(tables.staffProfiles).values({ userId: user.id, status: 'registered' }).onConflictDoNothing()
    }
    return user
  })
  await audit(event, { actorUserId: user.id, action: 'user.accept_invite', entityType: 'user', entityId: user.id })
  await signIn(event, user)
  return { redirectTo: ROLE_HOME[user.role] }
})
