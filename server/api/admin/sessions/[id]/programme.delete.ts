import { adminSessionProgramme, dropSessionProgramme } from '#server/domain/programmes'
import type { SessionProgrammeDto } from '#shared/types/programmes'

/** Removes the session's copy: it goes back to the programme of its year. */
export default defineEventHandler(async (event): Promise<SessionProgrammeDto> => {
  const admin = await requireAdmin(event)
  const sessionId = requireUuidParam(event, 'id')
  await useDb().transaction(tx =>
    dropSessionProgramme(tx, { sessionId, actor: { userId: admin.id, ip: clientIp(event) } }),
  )
  return adminSessionProgramme(useDb(), sessionId)
})
