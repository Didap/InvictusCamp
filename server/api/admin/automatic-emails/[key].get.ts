import type { AutomaticEmailDetail } from '#shared/types/automatic-emails'
import { automaticEmailDetail } from '../../../domain/automatic-emails'

/** One automatic email: on or off, and the texts it leaves with now. */
export default defineEventHandler(async (event): Promise<AutomaticEmailDetail> => {
  await requireAdmin(event)
  return automaticEmailDetail(useDb(), requireAutomaticEmailKey(event))
})
