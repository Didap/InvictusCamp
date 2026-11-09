import type { UseFetchOptions } from '#app'

/** $fetch for the app's API: an expired session sends the user back to sign in (plugins/api.ts). */
export function useApi(): typeof $fetch {
  return useNuxtApp().$api as typeof $fetch
}

/** useFetch with the same behaviour. Use it for the data a page loads. */
export function useApiFetch<T>(url: string | (() => string), options?: UseFetchOptions<T>) {
  return useFetch(url, { ...options, $fetch: useNuxtApp().$api as typeof $fetch })
}
