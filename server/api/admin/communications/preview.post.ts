import { emailPreviewSchema } from '#shared/schemas/communications'
import type { EmailPreview } from '#shared/types/communications'
import { fillMessageFields, messageFieldValues } from '#shared/utils/message-fields'
import { sessionForFields } from '../../../domain/audiences'
import { communicationEmail } from '../../../emails/communications'

/**
 * The email as the recipients will see it, rendered by the real template: the fields are filled for the
 * first recipient and the session chosen, the others stay in braces.
 */
export default defineEventHandler(async (event): Promise<EmailPreview> => {
  const admin = await requireAdmin(event)
  const { subject, body, sessionId, firstName } = await parseBody(event, emailPreviewSchema)
  const values = messageFieldValues(firstName, sessionId ? await sessionForFields(useDb(), sessionId) : null)
  const message = communicationEmail(emailContext(), {
    to: admin.email,
    subject: fillMessageFields(subject, values) || 'Oggetto del messaggio',
    body: fillMessageFields(body, values) || 'Il testo del messaggio comparirà qui.',
  })
  return { subject: message.subject, html: message.html }
})
