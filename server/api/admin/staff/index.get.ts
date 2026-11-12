import { staffListQuerySchema } from '#shared/schemas/staff'
import { staffList } from '../../../domain/staff'

/**
 * Every staff account with its application; the page applies tabs, search and the role filter. With
 * ?sessionId= each person says whether they can come to that session.
 */
export default defineEventHandler(async event => {
  await requireAdmin(event)
  const { sessionId } = parseQuery(event, staffListQuerySchema)
  return staffList(useDb(), { sessionId })
})
