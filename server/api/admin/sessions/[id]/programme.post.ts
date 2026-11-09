import { adminSessionProgramme, copyProgrammeToSession } from '#server/domain/programmes'
import type { SessionProgrammeDto } from '#shared/types/programmes'

/** Gives the session its own copy of the programme of its year. */
export default defineEventHandler(async (event): Promise<SessionProgrammeDto> => {
  const admin = await requireAdmin(event)
  const sessionId = requireUuidParam(event, 'id')
  await useDb().transaction(tx =>
    copyProgrammeToSession(tx, { sessionId, actor: { userId: admin.id, ip: clientIp(event) } }),
  )
  return adminSessionProgramme(useDb(), sessionId)
})
