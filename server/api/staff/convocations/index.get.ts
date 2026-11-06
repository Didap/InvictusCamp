import type { MyConvocations } from '#shared/types/staff'
import { myConvocations } from '../../../domain/staff'

/** The convocations of the signed-in person (drafts are never shown), with the contract state. */
export default defineEventHandler(async (event): Promise<MyConvocations> => {
  const { user, profile } = await requireStaff(event)
  const approved = profile.status === 'approved'
  return { approved, items: await myConvocations(useDb(), user.id, { approved }) }
})
