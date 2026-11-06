import { userListQuery } from '#shared/schemas/users'
import type { Paginated } from '#shared/types/api'
import type { UserListItem } from '#shared/types/users'
import { listUsers } from '../../../domain/users'

/** Every account: search by name, email or family; filter by role and status; `ids` for chosen people. */
export default defineEventHandler(async (event): Promise<Paginated<UserListItem>> => {
  await requireAdmin(event)
  return listUsers(useDb(), parseQuery(event, userListQuery))
})
