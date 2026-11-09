import { isPublicPath } from '#shared/utils/routes'

// $api: $fetch that, when the server answers 401 (session expired or account disabled), clears the
// session and sends the user to sign in, then back to the page they were on.
export default defineNuxtPlugin(() => {
  const api = $fetch.create({
    async onResponseError({ response }) {
      if (response.status !== 401) return
      await useUserSession().clear()
      const route = useRouter().currentRoute.value
      if (!isPublicPath(route.path)) await navigateTo({ path: '/accedi', query: { redirect: route.fullPath } })
    },
  })
  return { provide: { api } }
})
