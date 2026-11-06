<script setup lang="ts">
// The Invictus Camp mark (blue, yellow and red around a white "A"), drawn from the official logo,
// with the name set in the UI face.
withDefaults(defineProps<{ compact?: boolean; subtitle?: string | false; size?: 'md' | 'lg' }>(), {
  compact: false,
  subtitle: 'Gestionale',
  size: 'md',
})
</script>

<template>
  <NuxtLink
    to="/"
    class="flex items-center gap-3 rounded-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
    aria-label="Invictus Camp, torna alla home"
  >
    <svg :class="size === 'lg' ? 'size-12' : 'size-9'" class="shrink-0" viewBox="0 0 100 100" aria-hidden="true">
      <path fill="#1d89c7" d="M50 0 L8.74 77.62 A50 50 0 0 1 50 0 Z" />
      <path fill="#fcbc50" d="M50 0 L91.26 77.62 A50 50 0 0 0 50 0 Z" />
      <path fill="#cb333a" d="M50 39 L22.03 91.61 A50 50 0 0 0 77.97 91.61 Z" />
    </svg>
    <span v-if="!compact" class="flex min-w-0 flex-col leading-tight">
      <span :class="size === 'lg' ? 'text-xl' : 'text-base'" class="font-bold tracking-tight text-highlighted">
        Invictus Camp
      </span>
      <span v-if="subtitle" class="truncate text-xs font-semibold text-muted">{{ subtitle }}</span>
    </span>
  </NuxtLink>
</template>
