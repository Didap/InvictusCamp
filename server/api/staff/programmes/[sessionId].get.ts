import { staffProgramme } from '#server/domain/programmes'
import type { ProgrammeView } from '#shared/types/programmes'

/** The programme of a session whose convocation the person accepted. */
export default defineEventHandler(async (event): Promise<ProgrammeView> => {
  const { user } = await requireStaff(event)
  return staffProgramme(useDb(), { userId: user.id, sessionId: requireUuidParam(event, 'sessionId') })
})
