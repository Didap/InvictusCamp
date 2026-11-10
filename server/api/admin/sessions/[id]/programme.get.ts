import { adminSessionProgramme } from '#server/domain/programmes'
import type { SessionProgrammeDto } from '#shared/types/programmes'

/** The programme the session uses: its own copy, the one of its year, or none yet. */
export default defineEventHandler(async (event): Promise<SessionProgrammeDto> => {
  await requireAdmin(event)
  return adminSessionProgramme(useDb(), requireUuidParam(event, 'id'))
})
