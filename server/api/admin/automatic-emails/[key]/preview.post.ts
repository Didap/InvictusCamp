import { emailTextsDraftSchema } from '#shared/schemas/automatic-emails'
import type { EmailPreview } from '#shared/types/communications'
import { exampleEmail } from '../../../../domain/automatic-emails'

/** The email with the texts being written and example data, rendered by its real template. */
export default defineEventHandler(async (event): Promise<EmailPreview> => {
  const admin = await requireAdmin(event)
  const key = requireAutomaticEmailKey(event)
  const texts = await parseBody(event, emailTextsDraftSchema)
  const message = exampleEmail(
    await emailContext(),
    key,
    { to: admin.email, toUserId: admin.id, firstName: admin.firstName },
    texts,
  )
  return { subject: message.subject, html: message.html }
})
