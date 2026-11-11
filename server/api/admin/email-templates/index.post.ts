import { emailTemplateSchema } from '#shared/schemas/communications'
import { createEmailTemplate } from '../../../domain/email-templates'

/** Saves a new template: nothing is sent. */
export default defineEventHandler(async event => {
  await requireAdmin(event)
  const input = await parseBody(event, emailTemplateSchema)
  return { id: await createEmailTemplate(useDb(), input) }
})
