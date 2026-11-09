import { inviteUserSchema } from '#shared/schemas/users'
import { duplicateEmail, inviteUser } from '../../../domain/users'

/** Invites a person: the account waits for its password, the invitation link lasts 7 days. */
export default defineEventHandler(async event => {
  const admin = await requireAdmin(event)
  const input = await parseBody(event, inviteUserSchema)
  const { user, messages } = await useDb()
    .transaction(tx => inviteUser(tx, emailContext(), input, { userId: admin.id, ip: clientIp(event) }))
    .catch(error => {
      throw isUniqueViolation(error) ? duplicateEmail() : error
    })
  const report = await deliver(messages)
  return { id: user.id, emails: messages.length, failed: report.failed }
})
