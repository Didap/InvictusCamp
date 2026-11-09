<script setup lang="ts">
// A number that matters, with what it means. Links to the list behind it when `to` is set.
defineProps<{ label: string; value: string | number; hint?: string; icon?: string; to?: string }>()
const NuxtLink = resolveComponent('NuxtLink')
</script>

<template>
  <component
    :is="to ? NuxtLink : 'div'"
    :to="to"
    class="block rounded-lg border border-default bg-elevated p-5 transition-colors"
    :class="
      to
        ? 'hover:border-accented focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary'
        : ''
    "
  >
    <div class="flex items-center justify-between gap-3">
      <p class="text-sm font-semibold text-muted">{{ label }}</p>
      <UIcon v-if="icon" :name="icon" class="size-5 shrink-0 text-dimmed" aria-hidden="true" />
    </div>
    <p class="mt-2 text-3xl font-bold text-highlighted tabular-nums">{{ value }}</p>
    <p v-if="hint" class="mt-1 text-sm text-muted">{{ hint }}</p>
  </component>
</template>
