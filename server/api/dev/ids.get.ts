import { and, asc, desc, eq, sql } from 'drizzle-orm'
import { DEMO_ACCOUNTS } from '../../domain/seed'

/**
 * Development only: ids of the demo data, so scripts/page-check.mjs can open detail pages
 * ("/admin/sessioni/{session}"). The pending signature is the one of the signed-in user, if any.
 */
export default defineEventHandler(async event => {
  if (!import.meta.dev) throw createError({ statusCode: 404, message: 'Non trovato' })
  const db = useDb()
  const { campSessions, families, users, documents, signatureRequests, communications } = tables
  // The first one with families: the calendar adds empty drafts before the demo's.
  const sessionIn = async (status: 'inviting' | 'draft' | 'completed') =>
    (
      await db
        .select({ id: campSessions.id })
        .from(campSessions)
        .where(eq(campSessions.status, status))
        .orderBy(
          desc(sql`exists (select 1 from ${tables.sessionFamilies} where session_id = ${campSessions.id})`),
          asc(campSessions.startDate),
        )
        .limit(1)
    )[0]?.id ?? null
  const userId = async (email: string) =>
    (await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1))[0]?.id ?? null
  const familyUserId = await userId(DEMO_ACCOUNTS.family)
  const family = familyUserId
    ? ((await db.select({ id: families.id }).from(families).where(eq(families.userId, familyUserId)).limit(1))[0]?.id ??
      null)
    : null
  const session = await getUserSession(event)
  const signature = session.user
    ? ((
        await db
          .select({ id: signatureRequests.id })
          .from(signatureRequests)
          .where(and(eq(signatureRequests.userId, session.user.id), eq(signatureRequests.status, 'pending')))
          .limit(1)
      )[0]?.id ?? null)
    : null
  return {
    session: await sessionIn('inviting'),
    sessionDraft: await sessionIn('draft'),
    sessionPast: await sessionIn('completed'),
    family,
    staff: await userId(DEMO_ACCOUNTS.staff),
    candidate: await userId(DEMO_ACCOUNTS.candidate),
    document:
      (await db.select({ id: documents.id }).from(documents).orderBy(asc(documents.createdAt)).limit(1))[0]?.id ?? null,
    communication: (await db.select({ id: communications.id }).from(communications).limit(1))[0]?.id ?? null,
    signature,
  }
})
