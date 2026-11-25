import type { MyAvailability } from '#shared/types/staff'
import { confirmAvailability } from '../../../domain/staff'

/** «Conferma le preferenze»: the answers are fixed until the administration reopens them (spec 3.5). */
export default defineEventHandler(async (event): Promise<MyAvailability> => {
  const { user } = await requireStaff(event)
  return useDb().transaction(tx =>
    confirmAvailability(tx, { userId: user.id, actor: { userId: user.id, ip: clientIp(event) } }),
  )
})
