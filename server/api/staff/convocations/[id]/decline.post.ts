import { convocationDeclineSchema } from '#shared/schemas/staff'
import { answerConvocation } from '../../../../domain/staff'

/** Declines a convocation, with an optional reason for the administration. */
export default defineEventHandler(async event => {
  const { user } = await requireStaff(event, 'approved')
  const id = requireUuidParam(event, 'id')
  const { reason } = await parseBody(event, convocationDeclineSchema)
  const ctx = await emailContext()
  await useDb().transaction(tx =>
    answerConvocation(tx, ctx, { id, userId: user.id, answer: 'decline', reason, ip: clientIp(event) }),
  )
  return { ok: true }
})
