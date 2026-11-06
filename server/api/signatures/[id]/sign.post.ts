import { signSchema } from '#shared/schemas/documents'
import type { SignaturePage } from '#shared/types/documents'
import { CODE_FAILURES, devCodes, signRequest, signaturePage } from '~~/server/domain/signatures'

/**
 * Signs the document with the code. A wrong code still counts as an attempt: the outcome commits with
 * the transaction, then the answer is a 400 that says how many attempts are left.
 */
export default defineEventHandler(async (event): Promise<SignaturePage> => {
  const user = await requireRole(event, 'family', 'staff')
  const requestId = requireUuidParam(event, 'id')
  const input = await parseBody(event, signSchema)
  rateLimit(`signature-sign:${user.id}`, 30, 10 * 60_000)
  const db = useDb()
  const outcome = await db.transaction(tx =>
    signRequest(tx, emailContext(), uploadsDir(), {
      requestId,
      userId: user.id,
      code: input.code,
      name: input.name,
      ip: clientIp(event),
      userAgent: getRequestHeader(event, 'user-agent') ?? null,
    }),
  )
  if (!outcome.ok) {
    const left =
      outcome.reason === 'wrong'
        ? outcome.attemptsLeft === 1
          ? ': ti resta un tentativo'
          : `: ti restano ${outcome.attemptsLeft} tentativi`
        : ''
    throw createError({
      statusCode: 400,
      message: `${CODE_FAILURES[outcome.reason]}${left}`,
      data: { reason: outcome.reason, attemptsLeft: outcome.attemptsLeft },
    })
  }
  devCodes.delete(requestId)
  await deliver(outcome.message)
  return signaturePage(db, requestId, user.id)
})
