import { communicationSchema } from '#shared/schemas/communications'
import type { CommunicationSendResult } from '#shared/types/communications'
import { sendCommunication } from '../../../../domain/audiences'

/** Sends a draft with its latest content; a draft is sent once. */
export default defineEventHandler(async (event): Promise<CommunicationSendResult> => {
  const admin = await requireAdmin(event)
  const draftId = requireUuidParam(event, 'id')
  const input = await parseBody(event, communicationSchema)
  const ctx = appEmailContext()
  const { communicationId, messages } = await useDb().transaction(tx =>
    sendCommunication(tx, ctx, { ...input, sentBy: admin.id, draftId }),
  )
  const report = await deliver(messages)
  return { id: communicationId, recipients: messages.length, ...report }
})
