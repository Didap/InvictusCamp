import { convocationSendSchema } from '#shared/schemas/staff'
import { sendConvocations } from '../../../domain/staff'

/** "Invia la convocazione": the chosen drafts are sent, one `staff.convocation` email each. */
export default defineEventHandler(async event => {
  const admin = await requireAdmin(event)
  const input = await parseBody(event, convocationSendSchema)
  const result = await useDb().transaction(tx =>
    sendConvocations(tx, emailContext(), { ...input, actor: { userId: admin.id, ip: clientIp(event) } }),
  )
  const report = await deliver(result.emails)
  return { sent: result.sent, skipped: result.skipped, failed: report.failed }
})
