import { messageTemplateSchema } from '#shared/schemas/communications'
import { createMessageTemplate } from '../../../domain/message-templates'

/** Saves a new template: nothing is sent. */
export default defineEventHandler(async event => {
  await requireAdmin(event)
  const input = await parseBody(event, messageTemplateSchema)
  return { id: await createMessageTemplate(useDb(), input) }
})
