import type { SignatureCodeState } from '#shared/types/documents'
import { canSendAccessEmail } from '~~/server/domain/email-quota'
import { devCodes, issueSignatureCode } from '~~/server/domain/signatures'

/**
 * Sends the six-digit code that confirms the signature (10 minutes, a new one after 60 seconds). With
 * the daily email limit reached it stops first, so a code already received keeps working.
 */
export default defineEventHandler(async (event): Promise<SignatureCodeState> => {
  const user = await requireRole(event, 'family', 'staff')
  const requestId = requireUuidParam(event, 'id')
  rateLimit(`signature-code:${user.id}`, 20, 60 * 60_000)
  if (!(await canSendAccessEmail(useDb()))) {
    throw createError({
      statusCode: 503,
      message: 'Oggi abbiamo raggiunto il limite di email. Puoi chiedere il codice di nuovo domani.',
    })
  }
  const { code, message, state } = await issueSignatureCode(useDb(), emailContext(), { requestId, userId: user.id })
  if (import.meta.dev) devCodes.set(requestId, code)
  const report = await deliver(message)
  if (report.failed) {
    throw createError({ statusCode: 502, message: 'Non sono riuscito a inviarti il codice. Riprova tra poco.' })
  }
  return state
})
