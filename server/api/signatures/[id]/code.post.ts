import type { SignatureCodeState } from '#shared/types/documents'
import { devCodes, issueSignatureCode } from '~~/server/domain/signatures'

/** Sends the six-digit code that confirms the signature (10 minutes, a new one after 60 seconds). */
export default defineEventHandler(async (event): Promise<SignatureCodeState> => {
  const user = await requireRole(event, 'family', 'staff')
  const requestId = requireUuidParam(event, 'id')
  rateLimit(`signature-code:${user.id}`, 20, 60 * 60_000)
  const { code, message, state } = await issueSignatureCode(useDb(), emailContext(), { requestId, userId: user.id })
  if (import.meta.dev) devCodes.set(requestId, code)
  await deliver(message)
  return state
})
