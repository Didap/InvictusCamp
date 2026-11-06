import { deleteDraft } from '../../../domain/audiences'

/** Deletes a draft. */
export default defineEventHandler(async event => {
  await requireAdmin(event)
  await deleteDraft(useDb(), requireUuidParam(event, 'id'))
  return { ok: true }
})
