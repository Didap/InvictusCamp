import type { ContactConfig } from '~/components/ic/ContactLine.vue'

export type ContactAudience = 'families' | 'staff'

/**
 * How to reach the camp (runtimeConfig.public.contact): families write to their own address, everyone
 * else to the general one. Without an audience, the role of the signed-in user decides.
 */
export function useContact(audience?: MaybeRefOrGetter<ContactAudience | undefined>) {
  const { user } = useUserSession()
  const { familiesEmail, ...contact } = useRuntimeConfig().public.contact
  return computed<ContactConfig>(() => {
    const chosen = toValue(audience)
    const families = chosen ? chosen === 'families' : user.value?.role === 'family'
    return families && familiesEmail ? { ...contact, email: familiesEmail } : contact
  })
}
