import { convocationAddSchema } from '#shared/schemas/staff'
import { addConvocations } from '../../../domain/staff'

/** Adds approved staff to a session as convocations to send, each with its role. Sends nothing. */
export default defineEventHandler(async event => {
  const admin = await requireAdmin(event)
  const input = await parseBody(event, convocationAddSchema)
  return useDb().transaction(tx => addConvocations(tx, { ...input, actor: { userId: admin.id, ip: clientIp(event) } }))
})
