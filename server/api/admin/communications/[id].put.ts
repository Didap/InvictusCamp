import { communicationDraftSchema } from '#shared/schemas/communications'
import { updateDraft } from '../../../domain/audiences'

/** Saves the changes of a draft (a message already sent cannot change). */
export default defineEventHandler(async event => {
  const admin = await requireAdmin(event)
  const id = requireUuidParam(event, 'id')
  const input = await parseBody(event, communicationDraftSchema)
  await updateDraft(useDb(), id, { ...input, authorId: admin.id })
  return { id }
})
