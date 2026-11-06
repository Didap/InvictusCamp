import { getSessionDetail } from '#server/domain/sessions'
import type { SessionDetail } from '#shared/types/sessions'

/** One session: facts, places, staff, and the valid moves with the emails each would send. */
export default defineEventHandler(async (event): Promise<SessionDetail> => {
  await requireAdmin(event)
  return getSessionDetail(useDb(), requireUuidParam(event, 'id'))
})
