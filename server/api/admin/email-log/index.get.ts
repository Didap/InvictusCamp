import { and, count, desc, eq, gte, ilike, isNotNull, or, sql, type SQL } from 'drizzle-orm'
import { emailLogQuery } from '#shared/schemas/communications'
import type { Paginated } from '#shared/types/api'
import type { EmailLogItem } from '#shared/types/communications'
import { containsPattern } from '../../../domain/users'

/**
 * Every email the platform sent, automatic or written, the most recent first. Filters: template,
 * status, recipient (name or address), session, communication, last N days.
 */
export default defineEventHandler(async (event): Promise<Paginated<EmailLogItem>> => {
  await requireAdmin(event)
  const query = parseQuery(event, emailLogQuery)
  const { emailLog, users, campSessions } = tables
  const pattern = query.q ? containsPattern(query.q) : null
  const conditions: (SQL | undefined)[] = [
    query.template ? eq(emailLog.template, query.template) : undefined,
    query.status ? eq(emailLog.status, query.status) : undefined,
    query.sessionId ? eq(emailLog.sessionId, query.sessionId) : undefined,
    query.communicationId ? eq(emailLog.communicationId, query.communicationId) : undefined,
    query.days ? gte(emailLog.createdAt, sql`now() - make_interval(days => ${query.days})`) : undefined,
    pattern
      ? or(
          ilike(emailLog.toEmail, pattern),
          ilike(sql`${users.firstName} || ' ' || ${users.lastName}`, pattern),
          ilike(emailLog.subject, pattern),
        )
      : undefined,
  ]
  const where = and(...conditions)
  const db = useDb()
  const [rows, [totals]] = await Promise.all([
    db
      .select({
        id: emailLog.id,
        template: emailLog.template,
        toEmail: emailLog.toEmail,
        toUserId: emailLog.toUserId,
        firstName: users.firstName,
        lastName: users.lastName,
        subject: emailLog.subject,
        status: emailLog.status,
        error: emailLog.error,
        hasContent: isNotNull(emailLog.html).mapWith(Boolean),
        sessionId: emailLog.sessionId,
        sessionTitle: campSessions.title,
        communicationId: emailLog.communicationId,
        createdAt: emailLog.createdAt,
      })
      .from(emailLog)
      .leftJoin(users, eq(users.id, emailLog.toUserId))
      .leftJoin(campSessions, eq(campSessions.id, emailLog.sessionId))
      .where(where)
      .orderBy(desc(emailLog.createdAt), desc(emailLog.id))
      .limit(query.pageSize)
      .offset((query.page - 1) * query.pageSize),
    db.select({ total: count() }).from(emailLog).leftJoin(users, eq(users.id, emailLog.toUserId)).where(where),
  ])
  return {
    items: rows.map(({ firstName, lastName, createdAt, ...row }) => ({
      ...row,
      toName: firstName ? `${firstName} ${lastName ?? ''}`.trim() : null,
      createdAt: createdAt.toISOString(),
    })),
    total: totals?.total ?? 0,
    page: query.page,
    pageSize: query.pageSize,
  }
})
