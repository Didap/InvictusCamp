import { messageTemplateSchema } from '#shared/schemas/communications'
import { updateMessageTemplate } from '../../../domain/message-templates'

/** Saves the changes of a template; the messages already written from it stay as they are. */
export default defineEventHandler(async event => {
  await requireAdmin(event)
  const id = requireUuidParam(event, 'id')
  const input = await parseBody(event, messageTemplateSchema)
  await updateMessageTemplate(useDb(), id, input)
  return { id }
})
