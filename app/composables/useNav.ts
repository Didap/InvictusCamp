import { inStaffArea } from '#shared/utils/constants'
import { type NavItem, navFor } from '#shared/utils/nav'

/** The sections of the sidebar for the signed-in role (`navFor`, shared with the guide's test). */
export function useNav() {
  const { user, session } = useUserSession()
  return computed<NavItem[][]>(() =>
    user.value ? navFor(user.value.role, inStaffArea(session.value?.staffStatus)) : [],
  )
}
