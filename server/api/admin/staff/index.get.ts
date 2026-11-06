import { staffListQuerySchema } from '#shared/schemas/staff'
import { staffList } from '../../../domain/staff'

/**
 * Every staff account with its application; the page applies tabs, search and the role filter. With
 * ?sessionId= each person carries the coverage of that session's dates.
 */
export default defineEventHandler(async event => {
  await requireAdmin(event)
  const { sessionId } = parseQuery(event, staffListQuerySchema)
  return staffList(useDb(), { sessionId })
})
