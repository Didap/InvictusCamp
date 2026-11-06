import { eq } from 'drizzle-orm'
import type { H3Event } from 'h3'
import type { AccountDto, SessionUser } from '#shared/types/api'
import type { UserRole } from '#shared/utils/constants'

type UserRow = typeof tables.users.$inferSelect

/** What goes in the session cookie. */
export function toSessionUser(user: Pick<UserRow, 'id' | 'role' | 'email' | 'firstName' | 'lastName'>): SessionUser {
  return { id: user.id, role: user.role, email: user.email, firstName: user.firstName, lastName: user.lastName }
}

/** GET/PATCH /api/account. */
export function toAccountDto(user: UserRow): AccountDto {
  return {
    ...toSessionUser(user),
    status: user.status,
    phone: user.phone,
    emailVerifiedAt: user.emailVerifiedAt?.toISOString() ?? null,
    lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
    createdAt: user.createdAt.toISOString(),
  }
}

/** Signs the user in (sealed cookie). */
export async function signIn(event: H3Event, user: UserRow) {
  await replaceUserSession(event, { user: toSessionUser(user), loggedInAt: new Date().toISOString() })
}

/**
 * The signed-in user, read back from the database on every request: an account that is gone or
 * disabled, or a session older than the last password change, is refused and its cookie cleared.
 * Never return this row to the client as it is (it holds the password hash): map it to a DTO.
 */
export async function requireUser(event: H3Event): Promise<UserRow> {
  const session = await requireUserSession(event)
  const [user] = await useDb().select().from(tables.users).where(eq(tables.users.id, session.user.id)).limit(1)
  const signedInAt = session.loggedInAt ? Date.parse(session.loggedInAt) : Number.NaN
  const changedAt = user?.passwordChangedAt?.getTime()
  if (!user || user.status !== 'active' || (changedAt && !(signedInAt >= changedAt))) {
    await clearUserSession(event)
    throw createError({ statusCode: 401, message: 'Sessione scaduta: accedi di nuovo' })
  }
  return user
}

/** The signed-in user if their role is one of `roles`, otherwise 403. */
export async function requireRole(event: H3Event, ...roles: UserRole[]): Promise<UserRow> {
  const user = await requireUser(event)
  if (!roles.includes(user.role)) {
    throw createError({ statusCode: 403, message: 'Non hai accesso a questa sezione' })
  }
  return user
}

export function requireAdmin(event: H3Event): Promise<UserRow> {
  return requireRole(event, 'admin')
}

/** The signed-in family account and its family. */
export async function requireFamily(event: H3Event) {
  const user = await requireRole(event, 'family')
  const [family] = await useDb().select().from(tables.families).where(eq(tables.families.userId, user.id)).limit(1)
  if (!family) throw createError({ statusCode: 404, message: 'Famiglia non trovata' })
  return { user, family }
}

/** The signed-in staff account and its profile; `approved` requires an approved application. */
export async function requireStaff(event: H3Event, options: { approved?: boolean } = {}) {
  const user = await requireRole(event, 'staff')
  const [profile] = await useDb()
    .select()
    .from(tables.staffProfiles)
    .where(eq(tables.staffProfiles.userId, user.id))
    .limit(1)
  if (!profile) throw createError({ statusCode: 404, message: 'Profilo staff non trovato' })
  if (options.approved && profile.status !== 'approved') {
    throw createError({ statusCode: 403, message: 'Disponibile dopo l’approvazione della candidatura' })
  }
  return { user, profile }
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_RE.test(value)
}

/** A route param that must be a uuid, or 404. */
export function requireUuidParam(event: H3Event, name: string): string {
  const value = getRouterParam(event, name)
  if (!isUuid(value)) throw createError({ statusCode: 404, message: 'Non trovato' })
  return value
}

/** The address of the client, behind the Coolify proxy too. */
export function clientIp(event: H3Event): string | null {
  return getRequestIP(event, { xForwardedFor: true }) ?? null
}
