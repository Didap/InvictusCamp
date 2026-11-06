import { sessionStaffQuerySchema } from '#shared/schemas/staff'
import { sessionStaffData } from '../../../domain/staff'

/** The Staff tab of a session: convocations with contract state, and the approved staff to add. */
export default defineEventHandler(async event => {
  await requireAdmin(event)
  const { sessionId } = parseQuery(event, sessionStaffQuerySchema)
  return sessionStaffData(useDb(), sessionId)
})
