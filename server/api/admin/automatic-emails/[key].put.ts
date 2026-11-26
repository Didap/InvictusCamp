import { emailTextsSchema } from '#shared/schemas/automatic-emails'
import type { AutomaticEmailDetail } from '#shared/types/automatic-emails'
import { automaticEmailDetail, saveEmailTexts } from '../../../domain/automatic-emails'

/** Saves the texts of an automatic email: the next ones leave with them. */
export default defineEventHandler(async (event): Promise<AutomaticEmailDetail> => {
  const admin = await requireAdmin(event)
  const key = requireAutomaticEmailKey(event)
  const texts = await parseBody(event, emailTextsSchema(key))
  await saveEmailTexts(useDb(), { key, texts, actorId: admin.id })
  return automaticEmailDetail(useDb(), key)
})
