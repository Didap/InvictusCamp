import type { NavigationMenuItem } from '@nuxt/ui'
import { inStaffArea } from '#shared/utils/constants'
import { navFor } from '#shared/utils/nav'

/** The sections of the sidebar for the signed-in role (`navFor`, shared with the guide's test). */
export function useNav() {
  const { user, session } = useUserSession()
  return computed<NavigationMenuItem[][]>(() =>
    user.value ? navFor(user.value.role, inStaffArea(session.value?.staffStatus)) : [],
  )
}
