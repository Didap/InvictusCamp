import type { CommunicationDetail } from '#shared/types/communications'
import { getCommunication } from '../../../domain/audiences'

/** A message, its audience and every email it sent with the delivery status. */
export default defineEventHandler(async (event): Promise<CommunicationDetail> => {
  await requireAdmin(event)
  return getCommunication(useDb(), requireUuidParam(event, 'id'))
})
