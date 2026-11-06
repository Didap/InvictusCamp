import type { MySignatureItem } from '#shared/types/documents'
import { mySignatures } from '~~/server/domain/signatures'

/** The documents of the signed-in family or staff member: to sign first, then the signed ones. */
export default defineEventHandler(async (event): Promise<MySignatureItem[]> => {
  const user = await requireRole(event, 'family', 'staff')
  return mySignatures(useDb(), user.id)
})
