<script setup lang="ts">
// The way out of every "write to the camp": the contacts of useContact as mailto: and tel: links.
// <IcContactLine lead="Se hai domande" />; inside a sentence, as="span"; on a public page for families,
// `families` (signed in, the role decides).
const props = withDefaults(defineProps<{ lead?: string; as?: 'p' | 'span'; families?: boolean }>(), { as: 'p' })
const contact = useContact(() => props.families)
const parts = computed(() => contactParts(contact.value, props.lead))
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
