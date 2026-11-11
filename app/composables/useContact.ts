export interface ContactConfig {
  email?: string
  phone?: string
  hours?: string
}

interface ContactPart {
  text: string
  href?: string
}

/**
 * How to reach the camp, as one sentence of text and links: "Se cambi idea, scrivi a info@… o chiama il
 * 099… (orari)." Only the contacts that are set appear; with none, it names the administration.
 */
export function contactParts(contact: ContactConfig, lead?: string): ContactPart[] {
  const email = contact.email?.trim()
  const phone = contact.phone?.trim()
  const hours = contact.hours?.trim()
  const start = (verb: string) => (lead ? `${lead}, ${verb}` : verb.charAt(0).toUpperCase() + verb.slice(1))
  if (!email && !phone) return [{ text: `${start('scrivi')} all’amministrazione del camp.` }]
  const parts: ContactPart[] = []
  if (email) parts.push({ text: `${start('scrivi a')} ` }, { text: email, href: `mailto:${email}` })
  if (phone) {
    parts.push(
      { text: email ? ' o chiama il ' : `${start('chiama il')} ` },
      { text: phone, href: `tel:${phone.replace(/[^\d+]/g, '')}` },
    )
    if (hours) parts.push({ text: ` (${hours})` })
  }
  parts.push({ text: '.' })
  return parts
}

/** The same sentence as plain text, for places that take no links (the description of a confirmation). */
export function contactSentence(contact: ContactConfig, lead?: string): string {
  return contactParts(contact, lead)
    .map(part => part.text)
    .join('')
}

/** How families or staff reach the camp, with the question the help box asks. */
export interface Contact extends ContactConfig {
  question: string
}

/**
 * How to reach the camp (runtimeConfig.public.contact): families write to their own address, everyone
 * else to the general one. `families` for a public page; signed in, the role decides.
 */
export function useContact(families?: MaybeRefOrGetter<boolean | undefined>) {
  const { user } = useUserSession()
  const { familiesEmail, ...contact } = useRuntimeConfig().public.contact
  return computed<Contact>(() =>
    (toValue(families) || user.value?.role === 'family') && familiesEmail
      ? { ...contact, email: familiesEmail, question: 'Ti occorre supporto per la registrazione?' }
      : { ...contact, question: 'Serve aiuto?' },
  )
}
