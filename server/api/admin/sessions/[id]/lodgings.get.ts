import { sessionLodgingsOf } from '#server/domain/lodgings'
import type { SessionLodgingsDto } from '#shared/types/lodgings'

/** The layout and the families holding a place, with their size and needs. No health details. */
export default defineEventHandler(async (event): Promise<SessionLodgingsDto> => {
  await requireAdmin(event)
  return sessionLodgingsOf(useDb(), requireUuidParam(event, 'id'))
})
