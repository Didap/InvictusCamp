// Accounts managed by the administration (docs/spec.md, 3.1): invite a person (family, staff or
// administration), send the invitation again, disable and enable an account (never your own), send a
// password reset link. Every function returns the emails to deliver after the commit.
import { and, asc, count, desc, eq, ilike, inArray, isNull, or, sql, type SQL } from 'drizzle-orm'
import type { InviteUserInput, UserListQuery } from '../../shared/schemas/users'
import type { Paginated } from '../../shared/types/api'
import type { UserListItem } from '../../shared/types/users'
import { authTokens, familyMembers, families, staffProfiles, users } from '../db/schema'
import { inviteEmail, resetPasswordEmail } from '../emails/auth'
import type { EmailContext, EmailMessage } from '../emails/types'
import { writeAudit } from './audit'
import type { DbOrTx } from './db'
import { issueToken } from './tokens'
import { DomainError } from './errors'

type UserRow = typeof users.$inferSelect

export function httpError(statusCode: number, message: string): DomainError {
  return new DomainError(statusCode, message)
}

/** Who acts, for the audit log. */
export interface Actor {
  userId: string
  ip?: string | null
}

const notFound = () => httpError(404, 'Account non trovato')

async function findUser(db: DbOrTx, userId: string): Promise<UserRow> {
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1)
  if (!user) throw notFound()
  return user
}

function recipientOf(user: UserRow) {
  return { to: user.email, toUserId: user.id, firstName: user.firstName }
}

export const duplicateEmail = () => httpError(409, 'Esiste già un account con questa email: cercalo nell’elenco')

/**
 * Creates an invited account (no password) and its invitation (7 days). A family gets its record and
 * the person as first member and referent; staff gets the profile, `registered` or `approved`.
 */
export async function inviteUser(
  db: DbOrTx,
  ctx: EmailContext,
  input: InviteUserInput,
  actor: Actor,
): Promise<{ user: UserRow; messages: EmailMessage[] }> {
  const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, input.email)).limit(1)
  if (existing) throw duplicateEmail()
  const now = new Date()
  const [user] = await db
    .insert(users)
    .values({
      email: input.email,
      role: input.role,
      status: 'invited',
      firstName: input.firstName,
      lastName: input.lastName,
      phone: input.phone || null,
    })
    .returning()
  if (input.role === 'family') {
    const [family] = await db
      .insert(families)
      .values({
        userId: user!.id,
        name: input.familyName?.trim() || `Famiglia ${input.lastName}`,
        phone: input.phone || null,
      })
      .returning({ id: families.id })
    await db.insert(familyMembers).values({
      familyId: family!.id,
      firstName: input.firstName,
      lastName: input.lastName,
      relationship: 'parent',
      isReferent: true,
    })
  }
  const staffStatus = input.role === 'staff' ? (input.staffStatus ?? 'registered') : null
  if (staffStatus) {
    await db.insert(staffProfiles).values({
      userId: user!.id,
      status: staffStatus,
      ...(staffStatus === 'approved' ? { reviewedAt: now, reviewedBy: actor.userId } : {}),
    })
  }
  const token = await issueToken(db, user!.id, 'invite', now)
  await writeAudit(db, {
    actorUserId: actor.userId,
    action: 'user.invite',
    entityType: 'user',
    entityId: user!.id,
    data: { role: input.role, ...(staffStatus ? { staffStatus } : {}) },
    ip: actor.ip,
  })
  return { user: user!, messages: [inviteEmail(ctx, { ...recipientOf(user!), role: user!.role, token })] }
}

/** A new invitation link (the old one stops working). Only for accounts still invited. */
export async function resendInvite(
  db: DbOrTx,
  ctx: EmailContext,
  userId: string,
  actor: Actor,
): Promise<{ user: UserRow; messages: EmailMessage[] }> {
  const user = await findUser(db, userId)
  if (user.status !== 'invited') {
    throw httpError(
      409,
      user.status === 'disabled'
        ? 'L’account è disattivato: riattivalo prima di inviare l’invito'
        : 'L’account è già attivo: se serve, invia il link per reimpostare la password',
    )
  }
  const token = await issueToken(db, user.id, 'invite')
  await writeAudit(db, {
    actorUserId: actor.userId,
    action: 'user.invite_resend',
    entityType: 'user',
    entityId: user.id,
    ip: actor.ip,
  })
  return { user, messages: [inviteEmail(ctx, { ...recipientOf(user), role: user.role, token })] }
}

/**
 * Disables or enables an account. A disabled account cannot sign in, its open sessions stop at the
 * next request and its pending links stop working; enabled again it goes back to `active`, or to
 * `invited` when it never chose a password. Never on your own account.
 */
export async function setUserEnabled(db: DbOrTx, userId: string, enabled: boolean, actor: Actor): Promise<UserRow> {
  if (userId === actor.userId) {
    throw httpError(400, 'Non puoi disattivare o riattivare il tuo account')
  }
  const user = await findUser(db, userId)
  if (enabled === (user.status !== 'disabled')) return user
  const now = new Date()
  const status = enabled ? (user.passwordHash ? 'active' : 'invited') : 'disabled'
  const [updated] = await db.update(users).set({ status }).where(eq(users.id, user.id)).returning()
  if (!enabled) {
    await db
      .update(authTokens)
      .set({ usedAt: now })
      .where(and(eq(authTokens.userId, user.id), isNull(authTokens.usedAt)))
  }
  await writeAudit(db, {
    actorUserId: actor.userId,
    action: enabled ? 'user.enable' : 'user.disable',
    entityType: 'user',
    entityId: user.id,
    data: { from: user.status, to: status },
    ip: actor.ip,
  })
  return updated!
}

/**
 * Sends a link to choose a new password (1 hour); to an account that never chose one, a fresh
 * invitation instead. Refused for disabled accounts.
 */
export async function sendPasswordReset(
  db: DbOrTx,
  ctx: EmailContext,
  userId: string,
  actor: Actor,
): Promise<{ user: UserRow; messages: EmailMessage[] }> {
  const user = await findUser(db, userId)
  if (user.status === 'disabled') {
    throw httpError(409, 'L’account è disattivato: riattivalo prima di inviare il link')
  }
  const invitation = user.status === 'invited' || !user.passwordHash
  const token = await issueToken(db, user.id, invitation ? 'invite' : 'reset_password')
  await writeAudit(db, {
    actorUserId: actor.userId,
    action: invitation ? 'user.invite_resend' : 'user.reset_link',
    entityType: 'user',
    entityId: user.id,
    ip: actor.ip,
  })
  const message = invitation
    ? inviteEmail(ctx, { ...recipientOf(user), role: user.role, token })
    : resetPasswordEmail(ctx, { ...recipientOf(user), token })
  return { user, messages: [message] }
}

/** A LIKE pattern that matches `text` anywhere, with the wildcards of the text escaped. */
export function containsPattern(text: string): string {
  return `%${text.replace(/[\\%_]/g, '\\$&')}%`
}

/**
 * The order of the accounts page: the chosen column (roles and statuses in the order of their enum,
 * never signed in last), then by name, so that pages never overlap.
 */
function userListOrder(query: UserListQuery): SQL[] {
  const direction = query.order === 'desc' ? desc : asc
  const byName = (order: typeof asc) => [
    order(users.lastName),
    order(users.firstName),
    order(users.email),
    asc(users.id),
  ]
  switch (query.sort) {
    case 'role':
      return [direction(users.role), ...byName(asc)]
    case 'status':
      return [direction(users.status), ...byName(asc)]
    case 'lastLogin':
      return [sql`${users.lastLoginAt} ${sql.raw(query.order === 'desc' ? 'desc' : 'asc')} nulls last`, ...byName(asc)]
    default:
      return byName(direction)
  }
}

/** The accounts page: search by name, email or family name; filter by role and status; sortable columns. */
export async function listUsers(db: DbOrTx, query: UserListQuery): Promise<Paginated<UserListItem>> {
  const { page, pageSize } = query
  if (query.ids && !query.ids.length) return { items: [], total: 0, page, pageSize }
  const pattern = query.q ? containsPattern(query.q) : null
  const conditions: (SQL | undefined)[] = [
    query.role ? eq(users.role, query.role) : undefined,
    query.status ? eq(users.status, query.status) : undefined,
    query.ids ? inArray(users.id, query.ids) : undefined,
    pattern
      ? or(
          ilike(sql`${users.firstName} || ' ' || ${users.lastName}`, pattern),
          ilike(sql`${users.lastName} || ' ' || ${users.firstName}`, pattern),
          ilike(users.email, pattern),
          ilike(families.name, pattern),
        )
      : undefined,
  ]
  const where = and(...conditions)
  const inviteExpiresAt = sql`(
    select max(${authTokens.expiresAt}) from ${authTokens}
    where ${authTokens.userId} = ${users.id} and ${authTokens.purpose} = 'invite'
      and ${authTokens.usedAt} is null and ${authTokens.expiresAt} > now()
  )`.mapWith(authTokens.expiresAt)
  const [rows, [totals]] = await Promise.all([
    db
      .select({
        id: users.id,
        email: users.email,
        firstName: users.firstName,
        lastName: users.lastName,
        phone: users.phone,
        role: users.role,
        status: users.status,
        emailVerifiedAt: users.emailVerifiedAt,
        lastLoginAt: users.lastLoginAt,
        createdAt: users.createdAt,
        familyId: families.id,
        familyName: families.name,
        staffStatus: staffProfiles.status,
        inviteExpiresAt,
      })
      .from(users)
      .leftJoin(families, eq(families.userId, users.id))
      .leftJoin(staffProfiles, eq(staffProfiles.userId, users.id))
      .where(where)
      .orderBy(...userListOrder(query))
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    db.select({ total: count() }).from(users).leftJoin(families, eq(families.userId, users.id)).where(where),
  ])
  return {
    items: rows.map(row => ({
      id: row.id,
      email: row.email,
      firstName: row.firstName,
      lastName: row.lastName,
      phone: row.phone,
      role: row.role,
      status: row.status,
      emailVerified: row.emailVerifiedAt !== null,
      lastLoginAt: row.lastLoginAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
      familyId: row.familyId,
      familyName: row.familyName,
      staffStatus: row.staffStatus,
      inviteExpiresAt: row.status === 'invited' ? (row.inviteExpiresAt?.toISOString() ?? null) : null,
    })),
    total: totals?.total ?? 0,
    page,
    pageSize,
  }
}

/**
 * The first administration account of a new installation, from NUXT_FIRST_ADMIN_EMAIL and
 * NUXT_FIRST_ADMIN_PASSWORD (server/plugins/first-admin.ts). Does nothing once any admin exists, so the
 * variables can stay set until they are removed; refuses an address that already belongs to another account.
 */
export async function ensureFirstAdmin(
  db: DbOrTx,
  input: { email: string; passwordHash: string },
): Promise<'created' | 'admin-exists' | 'email-taken'> {
  const email = input.email.trim().toLowerCase()
  const [admin] = await db.select({ id: users.id }).from(users).where(eq(users.role, 'admin')).limit(1)
  if (admin) return 'admin-exists'
  const [taken] = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1)
  if (taken) return 'email-taken'
  const now = new Date()
  const [user] = await db
    .insert(users)
    .values({
      email,
      passwordHash: input.passwordHash,
      role: 'admin',
      status: 'active',
      firstName: 'Amministrazione',
      lastName: 'Invictus Camp',
      emailVerifiedAt: now,
      passwordChangedAt: now,
    })
    .returning({ id: users.id })
  await writeAudit(db, { action: 'user.first_admin', entityType: 'user', entityId: user!.id, data: { email } })
  return 'created'
}
