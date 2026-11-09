import { staffApplicationDraftSchema } from '#shared/schemas/staff'
import { myApplication, saveApplicationDraft } from '../../../domain/staff'

/** Saves the application as a draft; possible until it is sent. */
export default defineEventHandler(async event => {
  const { user } = await requireStaff(event)
  const input = await parseBody(event, staffApplicationDraftSchema)
  await useDb().transaction(tx => saveApplicationDraft(tx, user.id, input))
  return myApplication(useDb(), user.id)
})
