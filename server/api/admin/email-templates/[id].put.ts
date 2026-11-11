import { emailTemplateSchema } from '#shared/schemas/communications'
import { updateEmailTemplate } from '../../../domain/email-templates'

/** Saves the changes of a template; the messages already written from it stay as they are. */
export default defineEventHandler(async event => {
  await requireAdmin(event)
  const id = requireUuidParam(event, 'id')
  const input = await parseBody(event, emailTemplateSchema)
  await updateEmailTemplate(useDb(), id, input)
  return { id }
})
