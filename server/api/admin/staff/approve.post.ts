import { staffBulkApproveSchema } from '#shared/schemas/staff'
import { approveApplications } from '../../../domain/staff'

/** Approves several applications at once (no email: the outcome is communicated one by one). */
export default defineEventHandler(async event => {
  const admin = await requireAdmin(event)
  const { userIds } = await parseBody(event, staffBulkApproveSchema)
  return useDb().transaction(tx =>
    approveApplications(tx, { userIds, actor: { userId: admin.id, ip: clientIp(event) } }),
  )
})
