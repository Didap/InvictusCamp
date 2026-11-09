import { staffOutcomeSchema } from '#shared/schemas/staff'
import { staffOutcomeEmails } from '../../../../domain/staff'

/** "Comunica l’esito": one email (`staff.approved` or `staff.rejected`) with the message kept or written. */
export default defineEventHandler(async event => {
  const admin = await requireAdmin(event)
  const userId = requireUuidParam(event, 'userId')
  const { message } = await parseBody(event, staffOutcomeSchema)
  const emails = await useDb().transaction(tx =>
    staffOutcomeEmails(tx, emailContext(), { userId, message, actor: { userId: admin.id, ip: clientIp(event) } }),
  )
  return deliver(emails)
})
