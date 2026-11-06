import { sessionCandidates } from '#server/domain/sessions'
import { candidatesQuerySchema } from '#shared/schemas/sessions'
import type { SessionCandidate } from '#shared/types/sessions'

/** Families that can be added to the session (not in it, or no longer in it). ?q= searches. */
export default defineEventHandler(async (event): Promise<SessionCandidate[]> => {
  await requireAdmin(event)
  const sessionId = requireUuidParam(event, 'id')
  const { q } = parseQuery(event, candidatesQuerySchema)
  return sessionCandidates(useDb(), sessionId, q)
})
