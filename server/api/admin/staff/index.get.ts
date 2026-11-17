import { staffListQuerySchema } from '#shared/schemas/staff'
import { staffList } from '../../../domain/staff'

/**
 * The staff accounts with their application, ?team= one team (the lists /admin/staff and /admin/v-team);
 * the page applies tabs, search and the filters. With ?sessionId= each person says whether they can come
 * to that session.
 */
export default defineEventHandler(async event => {
  await requireAdmin(event)
  const { team, sessionId } = parseQuery(event, staffListQuerySchema)
  return staffList(useDb(), { team, sessionId })
})
