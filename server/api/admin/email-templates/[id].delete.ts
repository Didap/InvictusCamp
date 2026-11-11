import { deleteEmailTemplate } from '../../../domain/email-templates'

/** Deletes a template; the messages already written from it stay as they are. */
export default defineEventHandler(async event => {
  await requireAdmin(event)
  await deleteEmailTemplate(useDb(), requireUuidParam(event, 'id'))
  return { ok: true }
})
