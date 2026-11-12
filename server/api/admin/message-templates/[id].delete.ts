import { deleteMessageTemplate } from '../../../domain/message-templates'

/** Deletes a template; the messages already written from it stay as they are. */
export default defineEventHandler(async event => {
  await requireAdmin(event)
  await deleteMessageTemplate(useDb(), requireUuidParam(event, 'id'))
  return { ok: true }
})
