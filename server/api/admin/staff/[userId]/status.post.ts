import { staffStatusSchema } from '#shared/schemas/staff'
import { changeStaffStatus } from '../../../../domain/staff'

/**
 * Approve or reject an application, deactivate or reactivate approved staff (spec 3.4). Sends no
 * email: the outcome leaves only from POST /api/admin/staff/:userId/outcome.
 */
export default defineEventHandler(async event => {
  const admin = await requireAdmin(event)
  const userId = requireUuidParam(event, 'userId')
  const input = await parseBody(event, staffStatusSchema)
  const profile = await useDb().transaction(tx =>
    changeStaffStatus(tx, {
      userId,
      status: input.status,
      notes: input.notes,
      actor: { userId: admin.id, ip: clientIp(event) },
    }),
  )
  return { status: profile.status }
})
