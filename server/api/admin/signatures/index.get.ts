import { eq } from 'drizzle-orm'
import { userSignaturesQuerySchema } from '#shared/schemas/documents'
import type { SignatureRequestRow } from '#shared/types/documents'
import { signatureRows } from '~~/server/domain/signatures'

/** ?userId=: the documents assigned to one account, to sign first, most recent first. */
export default defineEventHandler(async (event): Promise<SignatureRequestRow[]> => {
  await requireAdmin(event)
  const { userId } = parseQuery(event, userSignaturesQuerySchema)
  return signatureRows(useDb(), eq(tables.signatureRequests.userId, userId), 'recent')
})
