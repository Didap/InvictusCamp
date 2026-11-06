import { emailPreviewSchema } from '#shared/schemas/communications'
import type { EmailPreview } from '#shared/types/communications'
import { communicationEmail } from '../../../emails/communications'

/** The email as the recipients will see it, rendered by the real template. */
export default defineEventHandler(async (event): Promise<EmailPreview> => {
  const admin = await requireAdmin(event)
  const { subject, body } = await parseBody(event, emailPreviewSchema)
  const message = communicationEmail(emailContext(), {
    to: admin.email,
    subject: subject || 'Oggetto del messaggio',
    body: body || 'Il testo del messaggio comparirà qui.',
  })
  return { subject: message.subject, html: message.html }
})
