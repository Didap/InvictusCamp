<script lang="ts">
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
</script>

<script setup lang="ts">
// The way out of every "write to the camp": the public contacts of nuxt.config.ts (runtimeConfig.public
// .contact) as mailto: and tel: links. <IcContactLine lead="Se hai domande" />; inside a sentence, as="span".
const props = withDefaults(defineProps<{ lead?: string; as?: 'p' | 'span' }>(), { as: 'p' })
const contact = useRuntimeConfig().public.contact as ContactConfig
const parts = computed(() => contactParts(contact, props.lead))
</script>

<template>
  <component :is="as">
    <template v-for="(part, index) in parts" :key="index">
      <a
        v-if="part.href"
        :href="part.href"
        class="rounded-sm font-semibold break-words text-primary underline-offset-2 hover:underline focus-visible:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >{{ part.text }}</a
      >
      <template v-else>{{ part.text }}</template>
    </template>
  </component>
</template>
