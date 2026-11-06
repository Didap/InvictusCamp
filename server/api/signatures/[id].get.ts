import type { SignaturePage } from '#shared/types/documents'
import { signaturePage } from '~~/server/domain/signatures'

/** The signing page: only the person the document is assigned to (anybody else gets 404). */
export default defineEventHandler(async (event): Promise<SignaturePage> => {
  const user = await requireRole(event, 'family', 'staff')
  return signaturePage(useDb(), requireUuidParam(event, 'id'), user.id)
})
