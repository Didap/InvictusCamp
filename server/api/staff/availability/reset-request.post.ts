import type { MyAvailability } from '#shared/types/staff'
import { requestAvailabilityReset } from '../../../domain/staff'

/** «Chiedi il reset»: the administration sees the request on the dashboard and on the person's page. */
export default defineEventHandler(async (event): Promise<MyAvailability> => {
  const { user } = await requireStaff(event)
  return useDb().transaction(tx =>
    requestAvailabilityReset(tx, { userId: user.id, actor: { userId: user.id, ip: clientIp(event) } }),
  )
})
