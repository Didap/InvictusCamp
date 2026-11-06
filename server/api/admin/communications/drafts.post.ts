import { communicationDraftSchema } from '#shared/schemas/communications'
import { saveDraft } from '../../../domain/audiences'

/** Saves a message as a draft: nothing is sent. */
export default defineEventHandler(async event => {
  const admin = await requireAdmin(event)
  const input = await parseBody(event, communicationDraftSchema)
  return { id: await saveDraft(useDb(), { ...input, authorId: admin.id }) }
})
