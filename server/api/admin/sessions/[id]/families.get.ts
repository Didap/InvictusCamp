import { sessionFamiliesOf } from '#server/domain/sessions'
import type { SessionFamiliesDto } from '#shared/types/sessions'

/** The families of a session: titolari, then reserves in calling order. No health details. */
export default defineEventHandler(async (event): Promise<SessionFamiliesDto> => {
  await requireAdmin(event)
  return sessionFamiliesOf(useDb(), requireUuidParam(event, 'id'))
})
