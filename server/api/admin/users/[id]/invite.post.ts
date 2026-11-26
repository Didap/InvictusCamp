import { resendInvite } from '../../../../domain/users'

/** Sends the invitation again with a new link (the previous one stops working). */
export default defineEventHandler(async event => {
  const admin = await requireAdmin(event)
  const userId = requireUuidParam(event, 'id')
  const ctx = await emailContext()
  const { messages } = await useDb().transaction(tx =>
    resendInvite(tx, ctx, userId, { userId: admin.id, ip: clientIp(event) }),
  )
  const report = await deliver(messages)
  return { emails: messages.length, failed: report.failed }
})
