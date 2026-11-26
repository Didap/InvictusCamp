import type { AutomaticEmailDetail } from '#shared/types/automatic-emails'
import { automaticEmailDefinition } from '#shared/utils/automatic-emails'
import { automaticEmailDetail, saveEmailTexts } from '../../../domain/automatic-emails'

/** Puts back the starting texts of an automatic email. Whether it is on does not change. */
export default defineEventHandler(async (event): Promise<AutomaticEmailDetail> => {
  const admin = await requireAdmin(event)
  const key = requireAutomaticEmailKey(event)
  await saveEmailTexts(useDb(), { key, texts: automaticEmailDefinition(key).defaults, actorId: admin.id })
  return automaticEmailDetail(useDb(), key)
})
