import { reopenAvailability } from '../../../../domain/staff'

/** «Riapri la disponibilità»: the person can change the answers and confirm again; one email tells them. */
export default defineEventHandler(async event => {
  const admin = await requireAdmin(event)
  const userId = requireUuidParam(event, 'userId')
  const emailCtx = await emailContext()
  const emails = await useDb().transaction(tx =>
    reopenAvailability(tx, { userId, ctx: emailCtx, actor: { userId: admin.id, ip: clientIp(event) } }),
  )
  await deliver(emails)
  return { ok: true }
})
