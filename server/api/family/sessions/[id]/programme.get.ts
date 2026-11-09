import { familyProgramme } from '#server/domain/programmes'
import type { ProgrammeView } from '#shared/types/programmes'

/** The programme of a session the family is invited to or confirmed in (`id` is the session). */
export default defineEventHandler(async (event): Promise<ProgrammeView> => {
  const { family } = await requireFamily(event)
  return familyProgramme(useDb(), { familyId: family.id, sessionId: requireUuidParam(event, 'id') })
})
