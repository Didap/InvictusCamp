import { GUEST_ONLY_PATHS, ROLE_HOME, areaRole, isPublicPath } from '#shared/utils/routes'

// Who may open what. The server checks again on every API call; this only keeps people on their pages.
export default defineNuxtRouteMiddleware(to => {
  const { loggedIn, user } = useUserSession()
  const home = user.value ? ROLE_HOME[user.value.role] : '/accedi'

  if (to.path === '/') return navigateTo(loggedIn.value ? home : '/accedi', { replace: true })

  if (isPublicPath(to.path)) {
    if (loggedIn.value && (GUEST_ONLY_PATHS as readonly string[]).includes(to.path)) {
      return navigateTo(home, { replace: true })
    }
    return
  }

  if (!loggedIn.value || !user.value) {
    return navigateTo({ path: '/accedi', query: { redirect: to.fullPath } })
  }

  const role = areaRole(to.path)
  if (role && role !== user.value.role) return navigateTo(home, { replace: true })
})
