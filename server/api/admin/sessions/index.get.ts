import { listSessions } from '#server/domain/sessions'
import { sessionListQuerySchema } from '#shared/schemas/sessions'
import type { SessionListItem } from '#shared/types/sessions'

/**
 * The sessions, upcoming first then past (contract, docs/BUILD.md): every status, or only those in
 * ?status=draft,inviting,confirmed; ?q= searches the title.
 */
export default defineEventHandler(async (event): Promise<SessionListItem[]> => {
  await requireAdmin(event)
  const query = parseQuery(event, sessionListQuerySchema)
  return listSessions(useDb(), { statuses: query.status, q: query.q })
})
