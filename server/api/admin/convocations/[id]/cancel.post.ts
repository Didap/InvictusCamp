import { cancelConvocation } from '../../../../domain/staff'

/** Withdraws a convocation: a draft is removed, a sent one is cancelled with an email (spec 3.5). */
export default defineEventHandler(async event => {
  const admin = await requireAdmin(event)
  const id = requireUuidParam(event, 'id')
  const result = await useDb().transaction(tx =>
    cancelConvocation(tx, emailContext(), { id, actor: { userId: admin.id, ip: clientIp(event) } }),
  )
  const report = await deliver(result.emails)
  return { removed: result.removed, emails: result.emails.length, failed: report.failed }
})
