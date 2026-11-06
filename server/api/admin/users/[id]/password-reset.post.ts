import { sendPasswordReset } from '../../../../domain/users'

/** Sends the link to choose a new password (an invitation to an account that never had one). */
export default defineEventHandler(async event => {
  const admin = await requireAdmin(event)
  const userId = requireUuidParam(event, 'id')
  rateLimit(`admin-reset:${userId}`, 5, 60 * 60_000)
  const { messages } = await useDb().transaction(tx =>
    sendPasswordReset(tx, emailContext(), userId, { userId: admin.id, ip: clientIp(event) }),
  )
  const report = await deliver(messages)
  return { emails: messages.length, failed: report.failed }
})
