import { availabilityConfirmSchema } from '#shared/schemas/staff'
import type { MyAvailability } from '#shared/types/staff'
import { confirmAvailability } from '../../../domain/staff'

/** «Conferma le preferenze» for the sessions the page showed: fixed until the administration reopens them. */
export default defineEventHandler(async (event): Promise<MyAvailability> => {
  const { user } = await requireStaff(event)
  const { sessionIds } = await parseBody(event, availabilityConfirmSchema)
  return useDb().transaction(tx =>
    confirmAvailability(tx, { userId: user.id, sessionIds, actor: { userId: user.id, ip: clientIp(event) } }),
  )
})
