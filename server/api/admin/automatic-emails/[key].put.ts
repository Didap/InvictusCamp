import { emailTextsSaveSchema } from '#shared/schemas/automatic-emails'
import type { AutomaticEmailDetail } from '#shared/types/automatic-emails'
import { automaticEmailDetail, saveEmailTexts } from '../../../domain/automatic-emails'

/** Saves the texts of an automatic email: the next ones leave with them. 409 if someone saved in between. */
export default defineEventHandler(async (event): Promise<AutomaticEmailDetail> => {
  const admin = await requireAdmin(event)
  const key = requireAutomaticEmailKey(event)
  const { texts, updatedAt } = await parseBody(event, emailTextsSaveSchema(key))
  return useDb().transaction(async tx => {
    await saveEmailTexts(tx, { key, texts, updatedAt, actorId: admin.id })
    return automaticEmailDetail(tx, key)
  })
})
