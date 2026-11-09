import { communicationSchema } from '#shared/schemas/communications'
import type { CommunicationSendResult } from '#shared/types/communications'
import { sendCommunication } from '../../../domain/audiences'

/** Sends a message now: the communication is recorded, one email per recipient goes out. */
export default defineEventHandler(async (event): Promise<CommunicationSendResult> => {
  const admin = await requireAdmin(event)
  const input = await parseBody(event, communicationSchema)
  const { communicationId, messages } = await useDb().transaction(tx =>
    sendCommunication(tx, emailContext(), { ...input, sentBy: admin.id }),
  )
  const report = await deliver(messages)
  return { id: communicationId, recipients: messages.length, ...report }
})
