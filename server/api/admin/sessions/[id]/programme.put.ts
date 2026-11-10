import { saveSessionProgramme } from '#server/domain/programmes'
import { programmeSaveSchema } from '#shared/schemas/programmes'
import type { SessionProgrammeDto } from '#shared/types/programmes'

/** Saves the session's own copy; 409 when someone saved after it was loaded. */
export default defineEventHandler(async (event): Promise<SessionProgrammeDto> => {
  const admin = await requireAdmin(event)
  const sessionId = requireUuidParam(event, 'id')
  const values = await parseBody(event, programmeSaveSchema)
  return useDb().transaction(tx =>
    saveSessionProgramme(tx, { sessionId, values, actor: { userId: admin.id, ip: clientIp(event) } }),
  )
})
