import { communicationListQuery } from '#shared/schemas/communications'
import type { Paginated } from '#shared/types/api'
import type { CommunicationListItem } from '#shared/types/communications'
import { listCommunications } from '../../../domain/audiences'

/** Messages written in the dashboard (drafts first); `sessionId` for the ones of a session. */
export default defineEventHandler(async (event): Promise<Paginated<CommunicationListItem>> => {
  await requireAdmin(event)
  return listCommunications(useDb(), parseQuery(event, communicationListQuery))
})
