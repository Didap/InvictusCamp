import { staffNotesSchema } from '#shared/schemas/staff'
import { saveReviewNotes } from '../../../../domain/staff'

/** Internal notes of the review; never shown to the person. */
export default defineEventHandler(async event => {
  await requireAdmin(event)
  const userId = requireUuidParam(event, 'userId')
  const { notes } = await parseBody(event, staffNotesSchema)
  await saveReviewNotes(useDb(), userId, notes)
  return { ok: true }
})
