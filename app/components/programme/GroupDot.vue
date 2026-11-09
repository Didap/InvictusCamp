<script setup lang="ts">
import type { ProgrammeGroup } from '#shared/utils/constants'

// The groups are named after a colour: the dot repeats the name next to it, it never replaces it.
// Wordmark colours: they are for categorical marks (main.css), and this is one.
defineProps<{ group: ProgrammeGroup }>()
const SWATCH: Record<ProgrammeGroup, string> = { yellow: 'bg-brand-yellow', red: 'bg-brand-red', blue: 'bg-brand-blue' }
</script>

<template>
  <span class="inline-block size-2.5 shrink-0 rounded-full" :class="SWATCH[group]" aria-hidden="true" />
</template>
