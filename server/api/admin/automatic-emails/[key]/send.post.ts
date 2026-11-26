import { manualSendSchema } from '#shared/schemas/automatic-emails'
import type { ManualSendResult } from '#shared/types/automatic-emails'
import { manualEmails } from '../../../../domain/automatic-emails'

/** "Invia a mano": the email with its saved texts to the people chosen, even when its event no longer sends it. */
export default defineEventHandler(async (event): Promise<ManualSendResult> => {
  const admin = await requireAdmin(event)
  const key = requireAutomaticEmailKey(event)
  const { audience } = await parseBody(event, manualSendSchema)
  const ctx = await emailContext()
  const messages = await useDb().transaction(tx => manualEmails(tx, ctx, { key, audience, actorId: admin.id }))
  return { recipients: messages.length, ...(await deliver(messages)) }
})
