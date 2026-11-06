import { eq } from 'drizzle-orm'
import type { EmailLogDetail } from '#shared/types/communications'

/** One email of the log with its content (null for access emails: links and codes are never kept). */
export default defineEventHandler(async (event): Promise<EmailLogDetail> => {
  await requireAdmin(event)
  const id = requireUuidParam(event, 'id')
  const { emailLog, users, campSessions } = tables
  const [row] = await useDb()
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
      html: emailLog.html,
      sessionId: emailLog.sessionId,
      sessionTitle: campSessions.title,
      communicationId: emailLog.communicationId,
      createdAt: emailLog.createdAt,
    })
    .from(emailLog)
    .leftJoin(users, eq(users.id, emailLog.toUserId))
    .leftJoin(campSessions, eq(campSessions.id, emailLog.sessionId))
    .where(eq(emailLog.id, id))
    .limit(1)
  if (!row) throw createError({ statusCode: 404, message: 'Email non trovata nel registro' })
  const { firstName, lastName, createdAt, ...rest } = row
  return {
    ...rest,
    hasContent: rest.html !== null,
    toName: firstName ? `${firstName} ${lastName ?? ''}`.trim() : null,
    createdAt: createdAt.toISOString(),
  }
})
