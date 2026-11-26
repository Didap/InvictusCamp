import type { AcceptResult } from '#shared/types/staff'
import { answerConvocation } from '../../../../domain/staff'

/** Accepts a convocation; when the session has a contract, the request to sign it is created and sent. */
export default defineEventHandler(async (event): Promise<AcceptResult> => {
  const { user } = await requireStaff(event, 'approved')
  const id = requireUuidParam(event, 'id')
  const ctx = await emailContext()
  const result = await useDb().transaction(tx =>
    answerConvocation(tx, ctx, { id, userId: user.id, answer: 'accept', ip: clientIp(event) }),
  )
  await deliver(result.emails)
  return { signatureRequestId: result.signatureRequestId }
})
